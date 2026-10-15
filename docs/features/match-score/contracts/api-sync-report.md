# API sync report — match-score — 2026-10-15

Contract: `contracts/openapi.yaml` (OpenAPI 3.1.0, 10 operations: 6 new matching operations and 4 restated search operations).
- Derived from: `data-model.md`, `sad.md` §4/§5/§8 and §6 flows 1–9, `spec.md` §4/§5/§6, ADR-0001 – ADR-0008, `ux-flows.md`, `CONTEXT.md` (Profile, Match score, Scoring cap, Scoring health) and collector ADR-0007.
- The precedent contracts are remote-filter's and applied-skipped's.

**Scope and form**
- **Interface kind:** `target_surfaces: [backend-service, web-frontend]`, read from sad.md, so the backend contract is HTTP/REST. The web app consumes this contract and does not author one.
- **Search operations:** `runSearch` and `getNextPage` are restated with `order` and `match`, and they **supersede** remote-filter's. `runMarkedView` and `getNextMarkedPage` are restated with `match`, and they **supersede** applied-skipped's. `openVisit` and `getWaitingCount` are unchanged and not restated, and the waiting count does not depend on scores. When `implement` changes them, `search/ports/routes.ts` and `search/app/present.ts` should point their contract comments at this file.
- **Self-contained:** `apps/server/test/helpers/contract.ts` resolves only `#/components/...` within one file. So the shared schemas (`Listing`, `LookAlike`, `MarkState`, and others) are copied **verbatim** from the remote-filter and applied-skipped contracts, not `$ref`'d across files.
- **Collector:** no HTTP change. The problem marker combines `GET /api/v1/collector/problems` with `getScoringHealth.problem` in the web app (sad.md §5).
- **Background scoring:** it has no HTTP operation (ADR-0003). It is woken in-process by a profile save, a cap change and a snapshot build.
- **`events.md`:** not produced. The scorer is an in-process scheduled job with no message bus (sad.md §5, §7). Its async rules are an idempotency key (text fingerprint + profile version + scorer version), retries at most every 15 minutes, and a dead-letter state after three strikes. They are drawn in §6 flows 1 and 7 and stored in `matching_scores` (data-model). They are not a message contract.

**Checks**
- **Lint:** `redocly lint` passes. Its one warning is `info-license`, the same as the earlier contracts.
- **Examples:** all 87 request and response examples validate against their schemas with Ajv 2020, the validator the contract helper uses. Every `$ref` resolves.
- **Inputs found:** data-model.md ✓, sad.md §6 ✓ (flows 1–9), spec.md ✓, ux-flows.md ✓, `.size` M, `.route` standard.

## Deviations from the skill defaults

These are the same deviations as the earlier contracts, plus one new.

| Default | Contract | Why |
|---|---|---|
| `BearerAuth` global | `security: []`, no scheme | Collector ADR-0007: no accounts, loopback only (AC-17) |
| Flat `{code, message, details?}` | `{ "error": { "code", "message" } }` | Repo convention, `core/errors.ts`. F-1 keeps it unchanged |
| `code` = `module.error_name` | UPPER_SNAKE with the `MATCHING_` prefix | Matches the existing codes |
| Every operation a JSON POST | `getMatchingSettings` and `getScoringHealth` are GETs | Read-only, like the collector's and remote-filter's GETs. No CORS, so another site cannot read the profile (AC-17) |
| `Idempotency-Key` on mutations | Not used | `saveProfile`, `setScoringCap` and `agreeNotice` set an absolute state, so a repeat is a no-op. `draftProfileFromCv` calls an outside party, but each call is the owner's explicit upload and a new charged attempt. The web never retries it (operation description), and a key would only add a stored-response table for a single-user tool |
| (new) Money | Integer `*_usd_cents` in the API, `*_usd_micros` in the DB | A float `multipleOf: 0.01` rejects values like 4.98 (a float-precision failure the example check caught). Spend is shown rounded **up** to the cent, so the screen never shows less than the ledger holds |

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| MatchingSettings.profile | data-model → `matching_settings.profile` (JSON; NULL = none) | high |
| MatchingSettings.profile_version | data-model → `matching_settings.profile_version` | high |
| MatchingSettings.cap_usd_cents | data-model → `matching_settings.cap_usd_micros` ÷ 10,000; spec AC-19 bounds $0–$100 | high |
| MatchingSettings.spent_usd_cents | data-model → `SUM(COALESCE(settled, reserved))` over `matching_spend` this month, rounded up | high |
| MatchingSettings.notice_agreed_at, NoticeState.notice_agreed_at | data-model → `matching_settings.notice_agreed_at` | high |
| Profile.skills[].name, .core | data-model `profile` JSON; CONTEXT Profile (≤ 50 chars, core / nice-to-have); AC-16 | high |
| Profile.years | data-model `profile` JSON; AC-16 (≤ 60) | high |
| Profile.seniority, .role_types, .engagement_forms | CONTEXT Profile fixed lists (snake_case ids) | high |
| Profile.min_salary.amount, .currency | data-model `profile` JSON; AC-16 (non-negative number, currency required); ISO 4217 code | high |
| Profile.min_salary.period | spec AC-16 / CONTEXT ("with currency and period"); list `hour, day, month, year` chosen in F-6 | medium |
| Profile.skills maxItems 50 | request guard; no spec bound | medium |
| SaveProfileResult.changed | data-model: `profile_version` bump rule (AC-10 note) | high |
| SetCapRequest.cap_usd_cents | data-model → `cap_usd_micros`; AC-19 | high |
| CvDraftRequest.* | sad.md §8 CV upload transport (base64 in JSON, 7 MB route limit); AC-08 (5 MB, kinds). Not stored (ADR-0007) | high |
| CvDraft.draft, .current | Profile shape; AC-07 (draft beside current) | high |
| CvDraft.field_sources | AC-07 ("from your CV" / "not found in your CV") | high |
| CvDraft.not_mapped | AC-07 ("not mapped") | high |
| CvDraft.removed | AC-09 ("told what was removed"); sad.md §6 flow 3 | high |
| ScoringHealth.last_success_at | data-model → `matching_settings.last_success_at` | high |
| ScoringHealth.cap_reached, .resumes_on | computed: ledger + cap, machine time zone (AC-12, ADR-0006) | high |
| ScoringHealth.pending_count | computed: owner's list (search export) minus current and could-not-score scores | high |
| ScoringHealth.oldest_pending_since | `collector_postings.first_found_at` of the oldest unscored posting (F-5) | medium |
| ScoringHealth.could_not_score_count | data-model → `matching_scores.strike_count ≥ 3`, `last_failure_at` this month | high |
| ScoringProblem.kind | data-model → `matching_settings.scoring_problem`, plus computed `cap_reached` | high |
| ScoringProblem.since | data-model → `scoring_problem_at`; for `cap_reached`, the `started_at` of the attempt that filled the cap | medium |
| Match.state | computed from `matching_scores` + `scoring_problem` + cap (CONTEXT Match score; AC-12, AC-14, AC-18) | high |
| Match.total, .parts.* | data-model → `matching_scores.total`, `*_part` | high |
| Match.note, .claims | data-model → `matching_scores.note`, `.claims` | high |
| Match.stale | computed: `text_fingerprint` vs today's / `profile_version` + `scorer_version` vs current (ADR-0005) | high |
| Match.reason | computed plain text from state, `last_failure`, `scoring_problem` | high |
| SearchRequest.order, SearchResult.order | data-model → `search_state.list_order` (NULL reads as newest) | high |
| SearchResult.has_profile | data-model → `matching_settings.profile IS NOT NULL` | high |
| Posting.match, MarkedPosting.match | Match via the score reader (ADR-0004) | high |
| Posting.*, Listing.*, LookAlike.*, LocationFilter.*, SearchResult.* (other) | remote-filter contract, verbatim | high |
| MarkedPosting.* (other), MarkState.*, MarkedPage.*, MarkedResult.* | applied-skipped contract, verbatim | high |

No field lacks an origin. The medium rows are the F-5 and F-6 decisions, a request guard, and a computed timestamp.

## B. Drift checklist

| # | Check | Result |
|---|---|---|
| 1 | Endpoint ↔ model: every matching operation reads or writes `matching_settings`, `matching_scores` or `matching_spend`. `runSearch` writes `search_state.list_order`. Every new column is reachable: `strike_key`, `text_fingerprint`, `scorer_version` and `reserved/settled` are internal and surface through `Match.state`, `Match.stale` and `spent_usd_cents` | ✓ |
| 2 | Error code ↔ repo: `VALIDATION_ERROR`, `FORBIDDEN_HOST`, `CROSS_SITE_REQUEST`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL` and `SEARCH_*` already exist. The new `MATCHING_INVALID_PROFILE`, `MATCHING_NOTICE_NOT_AGREED`, `MATCHING_CV_UNSUPPORTED`, `MATCHING_CV_NO_TEXT`, `MATCHING_CV_EMPTY`, `MATCHING_CV_TOO_LARGE`, `MATCHING_CAP_REACHED`, `MATCHING_DRAFT_UNUSABLE`, `MATCHING_PROVIDER_UNAVAILABLE` and `MATCHING_KEY_PROBLEM` are thrown as `AppError` by matching. The repo has no central registry, only the `core/errors.ts` pattern. The CV route maps Fastify's body-too-large error to `MATCHING_CV_TOO_LARGE` (sad.md §8) | ✓ |
| 3 | Validation ↔ constraint: cap 0–10,000 cents ↔ `cap_usd_micros` 0–100,000,000. Parts 0–100 or null ↔ nullable integer parts. Skill ≤ 50 chars and years ≤ 60 ↔ CONTEXT / AC-16. Fixed-list enums ↔ CONTEXT Profile. `ListOrder` ↔ `list_order` values. The stricter value is used everywhere, and no conflicts were found | ✓ |
| 4 | OpenAPI ↔ sequence: flow 4's invalid field, missing notice, and changed/unchanged branches ↔ 400 / 409 / `changed`. Flow 5's notice, cap, provider, unusable and decline branches ↔ 409 / 503 / 502 / no call. Flow 3's unreadable file ↔ 400 / 413. Flow 6's cap above or below spend ↔ 200 (the behaviour is in the description). Flow 8's order switch, new list and marked view ↔ `order`, `has_profile`, `MarkedPosting.match`. Flow 9's problem branches ↔ `problem.kind`. Flows 1, 2 and 7 ↔ `Match.state` / `stale` | ✓ with F-3 |

## C. Back-feed coverage

| AC | Operation / response |
|---|---|
| AC-01 | `Match.total`, `.parts`, `.note`; `runSearch` `best_match` example |
| AC-02 | `runSearch` description (counts identical in either order); `Match` never filters |
| AC-03 | `Match.note` / `.claims` plain text, "the posting says…"; info description |
| AC-04 | `MatchParts` null = not stated |
| AC-05 | `Match.claims`; `Posting.location_check` unchanged by score (`getNextPage` example) |
| AC-06 | `Match.stale: posting_changed` |
| AC-07 | `draftProfileFromCv` 200 (`field_sources`, `not_mapped`, `current`); confirmed with `saveProfile` |
| AC-08 | `draftProfileFromCv` 400 / 413 / 409 / 502 / 503 |
| AC-09 | `CvDraft.removed`; `InvalidProfile` contact rule |
| AC-10 | `saveProfile` `changed`; `Match.stale: profile_changed` |
| AC-11 | `SearchRequest.order`, `SearchResult.order`, `getNextPage` fresh `match` with a fixed order |
| AC-12 | `Match.state: cap_reached`; `ScoringHealth.cap_reached`, `resumes_on`; `DraftRefused` cap |
| AC-13 | `runSearch` description (a snapshot build wakes the scorer); `MarkedPosting.match` never re-scored |
| AC-14 | `Match.state: not_scored` + `reason`; `ScoringHealth.problem`, `last_success_at` |
| AC-15 | `SearchResult.has_profile`, `match: null`; `getMatchingSettings` `first_open` |
| AC-16 | `saveProfile` 400 `MATCHING_INVALID_PROFILE`; schema bounds |
| AC-17 | 403 `Forbidden` on every operation; no CORS |
| AC-18 | `Match.state: could_not_score`; `ScoringHealth.could_not_score_count` |
| AC-19 | `setScoringCap` |
| AC-20 | `agreeNotice`; 409 `MATCHING_NOTICE_NOT_AGREED` on `saveProfile` / `draftProfileFromCv` |
| AC-21 | `saveProfile` (first profile by hand) |

Every operation maps to a §4 user story:
- `getMatchingSettings` → US-03, US-05
- `saveProfile` → US-02, US-03
- `agreeNotice`, `draftProfileFromCv` → US-02
- `setScoringCap` → US-05
- `getScoringHealth` → US-05, US-06
- `runSearch`, `getNextPage` → US-01, US-04, US-06
- `runMarkedView`, `getNextMarkedPage` → US-01

## Findings

Four flags paused the run. All were resolved with the owner on 2026-10-15.

- **F-1 (accepted):** the profile field error stays in the repo envelope. The web checks AC-16's rules before sending and marks the field itself. The server's `MATCHING_INVALID_PROFILE` message starts with the field's name, as the backstop. `tasks`: the rules live in two places (web and `matching/domain`), so they should share one table-driven test.
- **F-2 (accepted, from the example check):** money in the API is in integer cents. See Deviations.
- **F-3 (accepted, sequence gap → OQ):** if `runSearch` / `getNextPage` cannot read scores, they **fail open**. The list is built newest first with `match: null`, because a score only orders and never hides (AC-02, AC-12 "the list keeps working"). This is unlike marks and location settings, which fail closed. No §6 flow draws this branch. **OQ, owner `sequences`, due before `tasks`:** add an `alt scores unreadable` branch to flow 2.
- **F-4 (accepted):** `draftProfileFromCv` has no `Idempotency-Key`. See Deviations.
- **F-5 (accepted):** `oldest_pending_since` is the oldest unscored posting's `first_found_at`. A posting that enters the list late (wider skills, filter off) shows its collection time until it is scored. The freshness NFR test measures new postings, so it is exact there. No new column.
- **F-6 (accepted):** the salary period is `hour | day | month | year`, and the currency is an ISO 4217 code. The conversion factors between periods are fixed in `matching/domain` (`tasks`), with one unit test over the table.

## Carried over from data-model

- sad.md §5 still says `match_scores` / `scoring_spend`. The tables are `matching_scores` / `matching_spend` (data-model audit). This contract uses no table names in paths, so nothing here changes. sad.md §5 still needs the rename.
