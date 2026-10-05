# API sync report — search-postings — 2026-10-05

Contract: `contracts/openapi.yaml` (OpenAPI 3.1.0, 4 operations). It is derived from `data-model.md`, `sad.md` §6 flows 1–5 (flows 3–5 from the working tree, still uncommitted), `spec.md` §4/§5, ADR-0001–0003 and collector ADR-0007.

- **Interface kind:** `target_surfaces: [backend-service, web-frontend]`, so the backend contract is HTTP/REST. The web app consumes this contract and does not author one.
- **`events.md`:** not produced. There are no async messages; search calls the collector's `app` export in-process (sad.md §8, "Events: N/A").
- **Lint:** `redocly lint` with the recommended ruleset passes with one warning (`info-license`, which a personal tool doesn't need). Examples are validated against the schemas.
- **Inputs found:** data-model.md ✓, sad.md §6 ✓ (flows 1–5), spec.md ✓, ux-flows.md ✓.

## Deviations from the skill defaults

| Default | Contract | Why |
|---|---|---|
| `BearerAuth` global | `security: []`, no scheme | Collector ADR-0007: no accounts, loopback only |
| Flat `{code, message, details?}` | `{ "error": { "code", "message" } }` | Repo convention, `core/errors.ts` |
| `code` = `module.error_name` | UPPER_SNAKE with the `SEARCH_` prefix | Matches the existing codes (`COLLECTOR_RUN_IN_PROGRESS`, `VALIDATION_ERROR`) |
| Cursor pagination over live data `{items, has_next, has_prev, next_cursor}` | Paging is over an in-memory snapshot, and every request is a POST. The response is `{items, has_next, next_cursor}` with no `has_prev`/`before` | ADR-0003: a live cursor could repeat or skip a posting whose publication time moved earlier. The list only ever appends, so there is no previous page. sad.md §8 makes all four operations POSTs because each changes state |
| `Idempotency-Key` on retriable mutations | Not used | Every retry is safe by construction. A visit is time-ruled, `runSearch` makes a fresh snapshot, and a page retry with the same cursor returns the same slice |

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| openVisit.last_skills | data-model → `search_state.last_skills` (JSON array; NULL → `[]`) | high |
| openVisit.previous_visit_started_at | data-model → `search_state.previous_visit_started_at` | high |
| runSearch.request.skills | spec AC-05 note: raw comma-separated text, parsed by `search/domain/skills.ts` (sad.md §8) | medium |
| runSearch.snapshot_id | ADR-0003, sad.md §5 Snapshots (UUIDv7, in memory) | high |
| runSearch.skills | data-model → `search_state.last_skills`, just saved (flow 3) | high |
| runSearch.total | derived: snapshot length (AC-01, AC-15) | high |
| runSearch.new_count | derived: count of `is_new` in the snapshot (AC-14) | high |
| runSearch.collection_empty | derived: zero open `collector_postings` (AC-11, flow 3 "no rows") | medium |
| \*.items[].id | data-model → `collector_postings.id` | high |
| \*.items[].title / company | data-model → `collector_postings.title` / `.company` | high |
| \*.items[].published_at | computed: `min(collector_postings.published_at, first_found_at)`, null when unknown (AC-03) | high |
| \*.items[].first_seen_at | data-model → `collector_postings.first_found_at` | high |
| \*.items[].is_new | computed: `first_found_at > search_state.previous_visit_started_at` (AC-14) | high |
| \*.items[].matched_skills[].skill | search input (owner's spelling, AC-06), bounded by `Skill` | high |
| \*.items[].matched_skills[].in_title | computed: matched in any open `collector_listings.title` (AC-06) | high |
| \*.items[].listings[].source_id | data-model → `collector_listings.source_id` | high |
| \*.items[].listings[].status | data-model → `collector_listings.status` | high |
| \*.items[].listings[].url | data-model → `collector_listings.url`, nulled when the listing is closed or the URL is not http/https (`search/domain/links.ts`) | high |
| \*.items[].listings[].location_restriction | data-model → `collector_listings.location_restriction` | high |
| getNextPage.cursor / \*.next_cursor | ADR-0003: position in the snapshot's id list, opaque to the web | high |
| \*.has_next | derived: `next_cursor` is not null | high |
| getWaitingCount.waiting_count | computed: matching open postings with `first_found_at` > snapshot loaded-at (AC-16, flow 2) | high |

Not sent: `collector_listings.description` (matching only, sad.md §8), `search_state.visit_started_at` / `visit_last_seen_at` (server-side visit rule only).

## B. Drift checklist

1. **Endpoint ↔ data-model (core): ✓.** `openVisit` reads and writes the `search_state` visit columns. `runSearch` writes `search_state.last_skills` and reads the collector's postings and listings. `getNextPage` reads postings by id. `getWaitingCount` writes the visit heartbeat and reads `first_found_at`.
2. **Error code ↔ repo error definitions (core): ✓, with a note.** The repo has no central registry; codes are literals passed to `AppError` / `envelope()`. These codes already exist: `FORBIDDEN_HOST`, `CROSS_SITE_REQUEST`, `UNSUPPORTED_MEDIA_TYPE` (`core/access.ts`), and `VALIDATION_ERROR`, `INTERNAL` (`core/errors.ts`). These are proposed, to add in `search/ports`:
   - `SEARCH_INVALID_SKILLS` (400)
   - `SEARCH_SNAPSHOT_EXPIRED` (410)
   - `SEARCH_COLLECTION_UNAVAILABLE` (503)
3. **Validation ↔ constraint (core): ✓.** `Skill` has `maxLength: 50`, and the skill arrays have `maxItems: 20`, both from AC-05 (data-model: bounded in the domain). `listings` has `minItems: 1` (a posting has ≥ 1 listing). The raw `SearchRequest.skills` text is deliberately **not** bounded by the schema, because AC-05 needs a message that names the skill and the rule, which only the domain check gives. Fastify's 1 MiB `bodyLimit` is the outer ceiling.
4. **OpenAPI ↔ sequence (supporting): ✓, after F-1.**
   - Flow 1 → `openVisit` 200.
   - Flow 3 branches:
     - rejected → 400 `SEARCH_INVALID_SKILLS`
     - cannot read → 503
     - no rows → 200 with `collection_empty`
     - nothing matches → 200 with `total: 0`
     - found or feed → 200
   - Flow 2: snapshot known → 200; expired → 410.
   - Flow 5: read failure → 503, retrying the same cursor; refresh = `runSearch`.
   - Flow 4 maps to `Listing` (`url` null when closed or unsafe).

## Coverage (back-feed)

| AC | Operation / response |
|---|---|
| AC-01 | `runSearch` 200 `total` + `items` |
| AC-02 | `runSearch` (matching), `matched_skills` |
| AC-03 | `Posting.published_at` (capped) + order + id tie-break |
| AC-04 | `runSearch` / `getNextPage` (open only; closed since loading left out) |
| AC-05 | `runSearch` 400 `SEARCH_INVALID_SKILLS` |
| AC-06 | `MatchedSkill.in_title` |
| AC-07 | `Posting` + `Listing` fields |
| AC-08 | `Listing.status` = closed, `url` null |
| AC-09 | `Listing.url` null for a non-http(s) URL; text fields plain |
| AC-10 | `runSearch` with empty `skills` (feed, empty `matched_skills`) |
| AC-11 | `runSearch` 200 `total: 0` + `collection_empty` + `skills` |
| AC-12 | 503 `SEARCH_COLLECTION_UNAVAILABLE` on `runSearch` / `getNextPage` |
| AC-13 | `openVisit.last_skills`; `runSearch` saves them |
| AC-14 | `openVisit` (visit rule), `is_new`, `new_count` |
| AC-15 | `runSearch` first 50 + `getNextPage` |
| AC-16 | `getNextPage` (snapshot), `getWaitingCount` |
| AC-17 | Crosscutting 403 `FORBIDDEN_HOST` / `CROSS_SITE_REQUEST` (collector ADR-0007); there is no operation for a visitor |

Every operation maps to a user story:
- `openVisit` → US-05, US-06
- `runSearch` → US-01 to US-04
- `getNextPage` → US-07
- `getWaitingCount` → US-07

## Findings

| # | Finding | Resolution |
|---|---|---|
| F-1 | Flow 2's waiting poll has no failure branch, but the contract needs 410 and 503 there. The web must not reload on a poll failure: the list changing by itself would break AC-16 | **Fixed in the contract.** A failed poll is silent; show-more or refresh handles it. A follow-up for `sequences` will add the branch to flow 2 (supporting; does not block) |
| F-2 | AC-08 says a posting is never shown without a linked open source. AC-09 says an unsafe link is not clickable. A posting whose only open listing has a non-http(s) URL satisfies both rules and contradicts AC-08. The collector does not check URL protocols at ingest | **Saved as an open question.** Owner: `specify`; due before `/sdd:tasks`. Until then the contract follows AC-09, the safety rule: the posting is listed and the source is named without a link |
| — | AC-02 wording (`#`/`+` after a skill) and AC-16 wording (closed since loading) | Already tracked in sad.md §11, due before `tasks`. The contract follows the sad.md §8 rule; not a new finding |

There are two flags and no core failure, so the run did not pause.
