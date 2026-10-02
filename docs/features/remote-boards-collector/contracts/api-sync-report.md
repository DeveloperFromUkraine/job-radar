# API sync report — remote-boards-collector — 2026-10-02

Contract: `contracts/openapi.yaml` (OpenAPI 3.1.0, 3 operations). Derived from `data-model.md`, `sad.md` §6 Flows 2 and 10 (with Flows 4, 7, 8 for computed fields), `spec.md` §4/§5, ADR-0002 and ADR-0007.

- Interface kind: `target_surfaces: [backend-service, web-frontend]` → HTTP/REST for the backend. The web app consumes this contract and does not author one.
- `events.md`: not produced. There are no async messages. Modules call each other in-process, and sad.md §8 says "Events: N/A".
- Lint: `redocly lint` with the recommended ruleset passes with 1 warning (`info-license`, not needed for a personal tool). Example-vs-schema validation is on, and a deliberately broken example was caught.
- Found: data-model.md ✓, sad.md §6 ✓ (Flows 1–10), spec.md ✓, ux-flows.md ✓.

## Deviations from the skill defaults

| Default | Contract | Why |
|---|---|---|
| `BearerAuth` global | `security: []`, no scheme | ADR-0007: no accounts, loopback only, Host allowlist, `Sec-Fetch-Site` check |
| Flat `{code, message, details?}` envelope | `{ "error": { "code", "message" } }` | Repo convention: `apps/server/src/core/errors.ts`, sad.md §8 |
| `code` = `module.error_name` | UPPER_SNAKE, module prefix `COLLECTOR_` | Matches the existing core codes (`NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL`). Owner decision 2026-10-02 |
| `Idempotency-Key` on a retriable mutation | Not used on `collectNow` | Repeating it is safe by construction: unique index `collector_runs_one_running_uq` plus ledger-based due-ness. A repeat gets 409 or `started: false` |
| Cursor pagination on lists | No paginated lists | The only lists are per-source (4 sources) and per-run arrays |

Other decision: "nothing due" on collect-now is 200 `{started: false}`, not an error (owner decision 2026-10-02).

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| getCollectorProblems.has_problem | derived: `problems` is non-empty | high |
| getCollectorProblems.problems[].kind (failing, silent, held_back, unknown_location) | data-model → `collector_source_flags.kind` (minus `category_unmatched`, AC-13 note) | high |
| getCollectorProblems.problems[].kind = overdue | computed: `collector_sources.last_read_at` + interval × 2 over `collector_app_sessions` (sad.md §6 Flows 7, 10) | medium |
| getCollectorProblems.problems[].kind = settings_unreadable | data-model → `collector_state.settings_problem` is not null | high |
| getCollectorProblems.problems[].source_id | data-model → `collector_source_flags.source_id` / `collector_sources.id` | high |
| getSourceHealth.any_run_finished | data-model → exists `collector_runs` with status `finished` | high |
| getSourceHealth.settings.notice | data-model → `collector_state.settings_notice` (`defaults_in_use`) | high |
| getSourceHealth.settings.problem / problem_since | data-model → `collector_state.settings_problem` / `settings_problem_at` | high |
| getSourceHealth.current_run | data-model → `collector_runs` where status `running` (+ `collector_run_sources`) | high |
| getSourceHealth.last_run | data-model → latest `collector_runs` with status `finished` or `incomplete` | high |
| getSourceHealth.sources[].source_id | data-model → `collector_sources.id` | high |
| getSourceHealth.sources[].state | settings in force (file or `collector_state.last_valid_settings`) + allowed rate in the adapter registry (code, not a column) | medium |
| getSourceHealth.sources[].last_success_at | data-model → `collector_sources.last_success_at` | high |
| getSourceHealth.sources[].next_due_at | computed: `collector_sources.last_read_at` + the source's interval (adapter registry), null when disabled or not_verified | medium |
| getSourceHealth.sources[].last_outcome | data-model → latest `collector_run_sources` row for the source | high |
| getSourceHealth.sources[].flags[].kind / reason / raised_at | data-model → `collector_source_flags` (+ computed overdue, `raised_at` null) | high |
| getSourceHealth.sources[].flags[].raises_marker | derived rule: false only for `category_unmatched` (spec AC-13 note) | medium |
| getSourceHealth.sources[].fill.* | data-model → `collector_sources.fill_status`, `fill_reached_at`, `fill_next_part_due_at`, `fill_completed_at` | high |
| getSourceHealth.sources[].reads.last_60_min / last_24_h | computed: count of `collector_request_ledger` by `source_id`, `sent_at` (spec §6 "visible in source health") | high |
| getSourceHealth.sources[].freshness.p90_minutes / sample_size | computed: `collector_listings.first_collected_at − published_at`, excluding `is_first_fill` and listings published outside `collector_app_sessions` (spec §6) | medium |
| getSourceHealth.sources[].freshness.without_publication_time | computed: `collector_listings.published_at` is null | high |
| Run.id / trigger / status / started_at / finished_at | data-model → `collector_runs.*` | high |
| RunSourceOutcome.source_id / outcome / failure_reason / fetch_finished_at | data-model → `collector_run_sources.*` | high |
| RunCounts.added / updated / closed / held / no_category | data-model → `collector_run_sources.added` … `no_category` | high |
| collectNow.requestBody | ADR-0007 (JSON body required); no fields | high |
| collectNow.started | derived: a run was opened (sad.md §6 Flow 2 branches) | high |
| collectNow.run | data-model → the new `collector_runs` row + its `collector_run_sources` rows | high |
| collectNow.next_due[] | computed as `sources[].next_due_at` and `state` above | medium |
| ErrorEnvelope.error.code / message | repo → `core/errors.ts` `ErrorEnvelope` | high |

The `medium` rows are computed fields. Their inputs are columns, and their rule lives in `domain/` (intervals and allowed rates are adapter code, by design, data-model.md §collector_sources). There are no `low` rows.

Data-model fields with no operation (`# unused-in-spec` check): `collector_postings.*` and `collector_listings.*` except the freshness computation, `collector_source_disabled_periods.*`, `collector_state.last_valid_settings*` and `last_cleanup_on`. These are internal: postings are browsed from roadmap step 3, and the rest serve Flows 4 and 9. Accepted, no endpoint needed.

## B. Drift checklist

1. **Endpoint ↔ data-model (core): ✓.** `getCollectorProblems` reads `collector_source_flags`, `collector_state`, `collector_sources` and `collector_app_sessions`. `getSourceHealth` reads `collector_sources`, `collector_runs`, `collector_run_sources`, `collector_request_ledger`, `collector_listings` and `collector_state`. `collectNow` writes `collector_runs` and `collector_run_sources`.
2. **Error code ↔ repo error definitions (core): ✓ with a note.** The repo has no central error registry. Codes are string literals passed to `AppError` / `envelope()` in `core/errors.ts`. Codes that already exist: `VALIDATION_ERROR`, `INTERNAL`. Codes proposed by this contract, to add when implemented: `COLLECTOR_RUN_IN_PROGRESS` (collector `ports/`), and `FORBIDDEN_HOST`, `CROSS_SITE_REQUEST`, `UNSUPPORTED_MEDIA_TYPE` (the ADR-0007 hook in `core/`).
3. **Validation ↔ constraint (core): ✓.** Every enum equals the TEXT values documented in data-model.md: `outcome`, `trigger`, `status`, `fill_status`, flag `kind` (+ computed `overdue`), `settings_notice`. `SourceId` equals the `collector_sources.id` registry codes. Text columns are unbounded, so there is no `maxLength`. Counts are `minimum: 0`.
4. **OpenAPI ↔ sequence (supporting): ✓, with one follow-up.**
   - Flow 2: already running → 409 `COLLECTOR_RUN_IN_PROGRESS`; nothing due → 200 `started: false` with `next_due`; started → 202 with `run`; the 2 s poll → `getSourceHealth.current_run`.
   - Flow 10: marker vs none → `ProblemSummary`; service error → 500 `INTERNAL` (inline banner); nothing collected yet → `any_run_finished: false`; at least one run → `sources[]` with flags, settings notice, disabled and not_verified states.
   - Flow 4: the run-in-progress branch is the same 409.

## Back-feed (coverage)

**Every operation maps to a user story and at least one AC:**

| Operation | US | AC |
|---|---|---|
| getCollectorProblems | US-04, US-08 | AC-13, AC-14, AC-25, AC-27 |
| getSourceHealth | US-04, US-05, US-06, US-08 | AC-02, AC-03, AC-12, AC-13, AC-14, AC-15, AC-19, AC-20, AC-23, AC-24, AC-25, AC-26, AC-27 |
| collectNow | US-05 | AC-02, AC-15, AC-16 |

**AC with no operation, and why:**

| AC | Why |
|---|---|
| AC-01, AC-04 to AC-11, AC-18, AC-21, AC-22 | Backend rules with no request/response surface: collecting, merging, closing, retention, catch-up, location statements. Their only visible trace is the counts in `getSourceHealth` (added / updated / closed / held). Postings are browsed from roadmap step 3. |
| AC-17 | Network boundary: loopback binding plus `FORBIDDEN_HOST` / `CROSS_SITE_REQUEST` (ADR-0007). There is no operation for a visitor. |

**US with no operation:** US-01, US-02, US-03, US-07. These are backend-only; ux-flows.md marks them "no owner-facing flow".

## Follow-ups (supporting, non-blocking)

| # | Finding | Resolution |
|---|---|---|
| F-1 | 403 `FORBIDDEN_HOST` / `CROSS_SITE_REQUEST` and 415 `UNSUPPORTED_MEDIA_TYPE` appear in no sad.md §6 flow | Accepted as crosscutting. The ADR-0007 request hook in `core/` applies to every route and is specified in sad.md §8 "Access control". It is not a per-flow branch, so no sequence change is needed |
| F-2 | Fastify's own errors pass through `core/errors.ts` with their internal code (e.g. a missing JSON body becomes `FST_ERR_CTP_INVALID_MEDIA_TYPE`, 415) | `implement`: map Fastify 415 to `UNSUPPORTED_MEDIA_TYPE` in `registerErrorHandling`, and add a test for it |
| F-3 | `collectNow` returns two 2xx statuses (202 started, 200 not started) | Accepted by the owner. The web app branches on `started`, not on status |

Flags: 3 supporting, 0 core failing. All three are resolved above. None needs an upstream fix.

## Reconcile — 2026-10-02 (review follow-ups)

- `FillState.status` gains `limited` (T30, review B12) — origin `data-model.md → collector_sources.fill_status`, high. New column `collector_sources.fill_cursor` is internal (no contract field).
