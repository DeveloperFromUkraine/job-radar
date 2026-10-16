# API sync report — realness-score — 2026-10-16

Contract: `contracts/openapi.yaml` (OpenAPI 3.1.0, 4 operations: 2 new realness operations and 2 restated search operations).
- Derived from: `data-model.md`, `sad.md` §4/§5/§8 and §6 flows 1–7, `spec.md` §4/§5/§6.1, ADR-0001 – ADR-0004, `ux-flows.md`, and `CONTEXT.md` (Realness signal, Realness penalty, Reason line, Pay field).
- The precedent contract is match-score's.

**Scope and form**
- **Interface kind:** `target_surfaces: [backend-service, web-frontend]`, read from sad.md, so the backend contract is HTTP/REST. The web consumes it.
- **Search operations:** `runSearch` and `getNextPage` are restated with `realness_on` and `Posting.realness`, and they **supersede** match-score's. `openVisit`, `getWaitingCount`, `runMarkedView` and `getNextMarkedPage` are unchanged (the marked view has no reason line).
- **Unchanged HTTP surfaces:** tracking (the mark record is a side effect in-process, flows 3 and 7) and collector (the pay field is read only in-process).
- **Self-contained:** `apps/server/test/helpers/contract.ts` resolves only in-file `$ref`s. So every shared schema and response (`Listing`, `Match`, `LocationFilter`, `ErrorEnvelope`, `Forbidden`, …) is copied **verbatim by script** from `match-score/contracts/openapi.yaml`. Only `Posting` (adds `realness`) and `SearchResult` (adds `realness_on`) are extended.
- **`events.md`:** not produced. There is no message bus; the collection run in flow 4 is the collector's existing in-process schedule.

**Checks**
- **Lint:** `redocly lint` is valid. Its one warning is `info-license`, as in the earlier contracts.
- **Examples:** all 32 request and response examples validate with Ajv 2020, the contract helper's validator, and every `$ref` resolves. The spec's AC-01 example (A 88, C 70, B 92 − 25 = 67) and AC-02 example (first found 47 days · reposted · no salary) appear as response examples.

## Deviations from the skill defaults

These are the same as match-score's:

| Default | Contract | Why |
|---|---|---|
| `BearerAuth` global | `security: []` | Collector ADR-0007: loopback only, no accounts (AC-12) |
| Flat `{code, message, details?}` | `{ "error": { "code", "message" } }` | `core/errors.ts` |
| `code` = `module.error_name` | UPPER_SNAKE `REALNESS_…` | Matches the existing codes (`TRACKING_MARKS_UNAVAILABLE`, `SEARCH_COLLECTION_UNAVAILABLE`) |
| Every operation a JSON POST | `getRealnessSettings` is a GET | Read-only, like `GET /remote-filter/settings`. No CORS |
| `Idempotency-Key` on mutations | Not used | `setRealnessOn` sets an absolute state, so a repeat is a no-op |

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| RealnessSettings.realness_on | data-model → `realness_settings.realness_on`; no row = true | high |
| RealnessOnRequest.on | spec AC-10; writes `realness_settings.realness_on` | high |
| SearchResult.realness_on | `realness_settings.realness_on` read at snapshot build | high |
| SearchResult.order | `search_state.list_order` (unchanged column); kept as best_match without a profile per ADR-0003 | high |
| Posting.realness | null when realness is off or there are no signals (sad.md §4) | high |
| Realness.penalty | sad.md §4 penalty rule, 1–30 when there is a signal | high |
| Realness.signals | sad.md §4 signal definitions; computed, not stored (data-model "Not stored") | high |
| RealnessSignal(age).basis/days | `collector_postings.published_at`, `first_found_at`; calendar days in `machineTimeZone()`; ≥ 30 (AC-01, AC-07) | high |
| RealnessSignal(many_boards).boards/days | open `collector_listings` from enabled sources (≥ 3); `first_found_at` ≥ 45 days (AC-01, AC-09) | high |
| RealnessSignal(repost) | `collector_postings.reopened_at` (new) or a closed look-alike posting > 7 days earlier (AC-08) | high |
| RealnessSignal(no_salary) | `collector_listings.pay_field` (new) + title/description amount rule (AC-06, ADR-0004) | high |
| Every other Posting / SearchResult field | Unchanged from match-score's contract (verbatim copy) | high |

## B. Drift checklist

| # | Check | Result |
|---|---|---|
| 1 | Endpoint ↔ model: every new field traces to a data-model column or a sad.md computed rule | ✓ |
| 2 | Error codes ↔ repo: `REALNESS_SETTINGS_UNAVAILABLE` is new and follows the `<MODULE>_…_UNAVAILABLE` 503 pattern (`tracking/app/marks.ts`); all other codes already exist | ✓ (one new code for `implement`) |
| 3 | Validation ↔ constraint: penalty 1–30 (cap 30); `days` minimums 30 and 45; `boards` ≥ 3; `on` boolean | ✓ |
| 4 | OpenAPI ↔ sequences: flow 2 save failure → `setRealnessOn` 503; flow 1 no profile / unreadable scores → `order: best_match` kept; flow 5 facts unreadable → fail-open (`realness: null`, no error); flows 3, 6, 7 failures → logged, the HTTP response is unchanged by design | ✓ |

## C. Coverage back-feed

| AC | Operation / response |
|---|---|
| AC-01 | runSearch 200 `best_match_lowered` |
| AC-02 | `Posting.realness`, RealnessSignal; runSearch `newest_signals` |
| AC-03 | runSearch description (counts unchanged); `match` untouched |
| AC-04 | runSearch description; `newest_signals` |
| AC-05 | runSearch description (unscored block by penalty; best match without a profile) |
| AC-06 | RealnessSignal `no_salary` |
| AC-07 | RealnessSignal `age.basis` |
| AC-08 | RealnessSignal `repost` |
| AC-09 | `many_boards.boards`; getNextPage description (changes from the next load) |
| AC-10 | getRealnessSettings, setRealnessOn 200 |
| AC-11 | setRealnessOn 503 `RealnessNotSaved` |
| AC-12 | 403 `Forbidden` on every operation |
| AC-13 | info.description (no provider request); `match` unchanged |
| AC-14 | No HTTP surface: kept in-process at mark time and on the day's first snapshot (described on runSearch and in info) |

Every operation maps to a user story: getRealnessSettings/setRealnessOn → US-03; runSearch → US-01, US-02, US-04, US-05; getNextPage → US-01, US-05. No sequence gaps were found, and no open questions were raised.
