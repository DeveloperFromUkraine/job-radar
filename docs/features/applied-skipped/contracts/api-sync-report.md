# API sync report — applied-skipped — 2026-10-07

Contract: `contracts/openapi.yaml` (OpenAPI 3.1.0, 7 operations: 2 new tracking operations, 3 restated search operations and 2 new search operations). It is derived from `data-model.md`, `sad.md` §6 flows 1–6, `spec.md` §4/§5, ADR-0001–0004, `ux-flows.md` and collector ADR-0007.

- **Interface kind:** `target_surfaces: [backend-service, web-frontend]`, read from sad.md, so the backend contract is HTTP/REST. The web app consumes this contract and does not author one.
- **Search operations:** `runSearch`, `getNextPage` and `getWaitingCount` are restated with their mark-aware behaviour. They **supersede** the same operations in `search-postings/contracts/openapi.yaml`, which should get a pointer to this file when `implement` changes `search/ports/routes.ts`. `openVisit` is unchanged.
- **`events.md`:** not produced. There are no async messages. Search calls tracking's `app` export in-process, and the collector calls tracking through its port (sad.md §8, "Events: N/A").
- **Lint:** `redocly lint` with the recommended ruleset passes. Its one warning is `info-license`, the same as the search contract. Every example validates against its schema.
- **Inputs found:** data-model.md ✓, sad.md §6 ✓ (flows 1–6), spec.md ✓, ux-flows.md ✓, `.size` S, `.route` quick.

## Deviations from the skill defaults

The search contract made the same deviations for the same reasons.

| Default | Contract | Why |
|---|---|---|
| `BearerAuth` global | `security: []`, no scheme | Collector ADR-0007: no accounts, loopback only |
| Flat `{code, message, details?}` | `{ "error": { "code", "message" } }` | Repo convention, `core/errors.ts` |
| `code` = `module.error_name` | UPPER_SNAKE with a module prefix (`TRACKING_`, `SEARCH_`) | Matches the existing codes |
| Cursor over live data with `has_prev` | Paging is over an in-memory snapshot and only appends, so there is no `has_prev` | Search ADR-0003, ADR-0002 here |
| `Idempotency-Key` on mutations | Not used | `setMark` is idempotent by construction: setting the current state is a no-op (F-3). `undoMark` is guarded by `change_id`, so a duplicate can't apply twice. No flow has an async actor |

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| setMark.posting_id / undoMark.posting_id (path) | data-model → `tracking_marks.posting_id` (FK → `collector_postings.id`) | high |
| setMark.request.mark | data-model → `tracking_marks.mark` (`applied` \| `skipped` \| NULL = cleared) | high |
| undoMark.request.change_id | data-model → `tracking_marks.change_id` | high |
| MarkState.posting_id | data-model → `tracking_marks.posting_id` | high |
| MarkState.mark | data-model → `tracking_marks.mark`; null also when no row exists | high |
| MarkState.marked_at | data-model → `tracking_marks.marked_at` | high |
| MarkState.change_id | data-model → `tracking_marks.change_id` | high |
| MarkState.at_risk | computed: `collector/app/retention-outlook.ts` "past 60 counted days" (sad.md §5, flow 3 "at-risk flag") | medium |
| MarkState.removed_after | computed: later of the grace-day end (`tracking_marks.applied_lost_at`, owner's time zone) and the retention date (flow 4 closed-cleared branch, AC-07) | medium |
| \*.items[].look_alike.mark / marked_at | data-model → the matched posting's `tracking_marks.mark` / `.marked_at` (ADR-0004) | high |
| \*.items[].look_alike.company | data-model → the matched posting's `collector_postings.company` | high |
| runSearch.total / new_count | search-postings, now counting unmarked matches only (ADR-0002, AC-12) | high |
| runSearch.marked_count | derived: matching open snapshot ids in the current marked set (ADR-0002, AC-13) | high |
| runMarkedView.marked_count / cleared_count | derived: marked-snapshot rows with `mark` set / with `mark` NULL and posting closed (AC-05) | high |
| MarkedPosting.status | data-model (read side) → `collector_postings.status` | high |
| MarkedPosting.mark_state | `MarkState`, read fresh per page | high |
| MarkedPosting.{id, title, company, published_at, first_seen_at, listings} | the collector columns, as in the search-postings report; closed postings included (`open-postings.ts` by id, sad.md §5) | high |
| MarkedPosting.matched_skills | search matcher over **every** listing (F-1) | medium |
| \*.next_cursor (main list) | ADR-0002: the snapshot position after the last id read | high |
| PostingPage.has_next | derived: an unmarked id remains past the cursor as of this page | medium |
| Posting.\*, Listing.\*, getWaitingCount.waiting_count | unchanged from the search-postings report; waiting excludes marked ids | high |

Not sent: `previous_mark`, `previous_marked_at`, `applied_lost_at` and `previous_applied_lost_at`, which are server-side undo and grace state only. Look-alike keys are also not sent, because they are computed (ADR-0004).

## B. Drift checklist

1. **Endpoint ↔ data-model (core): ✓.**
   - `setMark` writes `tracking_marks`, with all eight columns per ADR-0003.
   - `undoMark` uses the guarded `UPDATE … AND change_id = ?`, or deletes the row on a first mark.
   - The search operations read the current marked ids, and the marked view reads marks ordered by `marked_at`.
   - The collector schema is unchanged, which matches data-model §Scope.
2. **Error code ↔ repo error definitions (core): ✓, with a note.** The repo has no central registry; codes are literals passed to `AppError` / `envelope()`.
   - Existing codes: `FORBIDDEN_HOST`, `CROSS_SITE_REQUEST`, `UNSUPPORTED_MEDIA_TYPE`, `VALIDATION_ERROR`, `INTERNAL`, plus `SEARCH_INVALID_SKILLS`, `SEARCH_SNAPSHOT_EXPIRED` and `SEARCH_COLLECTION_UNAVAILABLE` (in `search/app/`).
   - Proposed, to add in `tracking/app` or `tracking/ports`:
     - `TRACKING_POSTING_NOT_FOUND` (404, AC-15)
     - `TRACKING_MARK_CHANGED_ELSEWHERE` (409, AC-04)
     - `TRACKING_MARKS_UNAVAILABLE` (503, AC-14)
3. **Validation ↔ constraint (core): ✓.**
   - `Mark` is the enum `[applied, skipped]`, matching data-model's TS-checked values, and null = cleared.
   - `posting_id` and `change_id` use `format: uuid` (UUIDv7).
   - Paging and skills bounds are unchanged from search.
4. **OpenAPI ↔ sequence (supporting): ✓, after F-2/F-4 (saved as an OQ).** Each flow branch maps to these responses:
   - Flow 1:
     - posting removed → 404
     - save fails → 503
     - saved → 200
     - undo changed elsewhere → 409
     - restored → 200
   - Flow 2: next page → 200 with `look_alike`.
   - Flow 3: `runMarkedView` + `getNextMarkedPage` → 200.
   - Flow 4:
     - removed → 404
     - fails → 503
     - changed or open cleared → 200
     - closed cleared → 200 with `removed_after`
   - Flow 5:
     - nothing left → 200 `total: 0` + `marked_count`
     - no match → 200 `marked_count: 0`
     - unmarked matches → 200
     - waiting → `getWaitingCount`
   - Flow 6: no HTTP surface (port only).

## Coverage (back-feed)

| AC | Operation / response |
|---|---|
| AC-01 | `setMark` `applied` → 200; `runSearch` / `getNextPage` leave it out afterwards |
| AC-02 | `setMark` `skipped` → 200; only this posting's row is written |
| AC-03 | `undoMark` 200 (exact previous state) |
| AC-04 | `undoMark` 409 `TRACKING_MARK_CHANGED_ELSEWHERE` |
| AC-05 | `runMarkedView` / `getNextMarkedPage`, `MarkedPosting.status`, `mark_state`, `marked_count`, `cleared_count`, `removed_after` |
| AC-06 | `setMark` with a new mark or null; `is_new` rule unchanged |
| AC-07 | `MarkState.at_risk` (web confirm), `removed_after` |
| AC-08 | No operation: collector events; marks persist in `tracking_marks` and are read per page |
| AC-09 | No operation: clean-up through the `ProtectedPostings` port (flow 6) |
| AC-10 | `Posting.look_alike` |
| AC-11 | `look_alike` is information only; the posting stays in `items` and `total` |
| AC-12 | `getNextPage` (walk past marked ids), `total` / `new_count` unmarked, `getWaitingCount` unmarked |
| AC-13 | `runSearch` 200 `total: 0` + `marked_count` |
| AC-14 | 503 `TRACKING_MARKS_UNAVAILABLE` on `setMark` / `undoMark` |
| AC-15 | 404 `TRACKING_POSTING_NOT_FOUND` on `setMark` / `undoMark` |
| AC-16 | Crosscutting 403 `FORBIDDEN_HOST` / `CROSS_SITE_REQUEST` (collector ADR-0007) |

Every operation maps to a user story:
- `setMark` → US-01, US-02, US-04
- `undoMark` → US-03
- `runSearch`, `getNextPage` → US-06, US-07
- `getWaitingCount` → US-07
- `runMarkedView`, `getNextMarkedPage` → US-04

## Findings

| # | Finding | Resolution |
|---|---|---|
| F-1 | In the marked view, skills narrow the list, but search matches only a posting's open listings. A closed marked posting could then never match, against AC-05's "closed ones included" | **Fixed in the contract** (owner, 2026-10-07): in the marked view a skill matches every listing, open or closed. The main list is unchanged |
| F-2 | Flow 1's undo has no posting-removed branch, but the contract needs 404 there (AC-15) | **Saved as an OQ.** Owner: `sequences`; due before the contract is finalized (before `/sdd:tasks`). Add the branch to flow 1's undo. The contract already carries the 404 |
| F-3 | No artifact defines setting the mark a posting already has (a stale second window) | **Fixed in the contract** (owner, 2026-10-07): a no-op that returns the current state and `change_id`, so the original mark date is kept |
| F-4 | Flows 2, 3 and 5 have no branch for search failing to read the marks, but the contract needs 503 there, since a list built without marks would show decided postings | **Saved as an OQ** with F-2, same owner and due date. The contract reuses `SEARCH_COLLECTION_UNAVAILABLE` |
| F-5 | Flow 4 calls the collector's retention outlook only on the closed-cleared branch, but `MarkState.at_risk` is returned on every write | **Accepted.** One extra in-process read per write; it keeps the card's AC-07 warning current after repeated changes in place |
| F-6 | AC-10's example hint says "at Acme", but the marked posting's stored company is "Acme Inc" | **Accepted.** `look_alike.company` is the stored company, and the web shows it as is. The spec example is illustrative |
| F-7 | Should loading the marked view save the skills as the last skills? | **Fixed in the contract** (owner, 2026-10-07): it does not save them; only `runSearch` does |

There were 7 flags and no core failure. The run paused at ≥ 3 flags, and the owner resolved F-1, F-2/F-4, F-3 and F-7. F-5 and F-6 are accepted as minor.

### Open question (for `sequences`)

- [ ] Add the missing branches: flow 1's undo "posting removed → told it is gone" (F-2), and "marks cannot be read → message with Retry" in flows 2, 3 and 5 (F-4). Owner: `sequences`; due: before `/sdd:tasks`.
