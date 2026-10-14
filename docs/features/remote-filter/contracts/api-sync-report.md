# API sync report — remote-filter — 2026-10-14

Contract: `contracts/openapi.yaml` (OpenAPI 3.1.0, 7 operations: 4 new remote-filter operations and 3 restated search operations).
- Derived from: `data-model.md`, `sad.md` §4/§5/§8 and §6 flows 1–7, `spec.md` §4/§5, ADR-0001 – ADR-0003, `ux-flows.md`, and collector ADR-0007.
- The precedent contracts are applied-skipped's and search-postings'.

**Scope and form**
- **Interface kind:** `target_surfaces: [backend-service, web-frontend]`, read from sad.md, so the backend contract is HTTP/REST. The web app consumes this contract and does not author one.
- **Search operations:** `runSearch`, `getNextPage` and `getWaitingCount` are restated with their location-aware behaviour. They **supersede** the same operations in `applied-skipped/contracts/openapi.yaml`, which should get a pointer to this file when `implement` changes `search/ports/routes.ts` and `search/app/present.ts`, the two code comments that name a contract. `openVisit`, `runMarkedView` and `getNextMarkedPage` are unchanged and not restated.
- **Collector:** no HTTP change. The "Anywhere" reading (AC-10) shows only as a value of the existing `Listing.location_restriction`.
- **`events.md`:** not produced. There are no async messages: search calls remote-filter's `app` export in-process (sad.md §8, "Events: N/A"). Collection is a scheduled in-process run (sad.md §6 flow 6) with no message bus.

**Checks**
- **Lint:** `redocly lint` with the recommended ruleset passes. Its one warning is `info-license`, the same as the earlier contracts.
- **Examples:** all 57 request and response examples validate against their schemas with Ajv 2020, the validator `apps/server/test/helpers/contract.ts` uses.
- **Inputs found:** data-model.md ✓, sad.md §6 ✓ (flows 1–7), spec.md ✓, ux-flows.md ✓, `.size` S, `.route` quick.

## Deviations from the skill defaults

These are the same deviations, for the same reasons, as the search and tracking contracts.

| Default | Contract | Why |
|---|---|---|
| `BearerAuth` global | `security: []`, no scheme | Collector ADR-0007: no accounts, loopback only |
| Flat `{code, message, details?}` | `{ "error": { "code", "message" } }` | Repo convention, `core/errors.ts` |
| `code` = `module.error_name` | UPPER_SNAKE with a module prefix (`REMOTE_FILTER_`, `SEARCH_`) | Matches the existing codes |
| Every operation a JSON POST | `getRemoteFilterSettings` is a GET | Read-only. The access guard lets safe methods through (`core/access.ts` `SAFE_METHODS`), as the collector's two GETs do. No CORS, so another site cannot read the response (AC-12). Like `search_state`, the row is created lazily on first read |
| `Idempotency-Key` on mutations | Not used | All three writes set an absolute state (country, on/off, look), so a repeat is a no-op. No flow has an async actor |

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| RemoteFilterSettings.country | data-model → `remote_filter_settings.country` (NULL = not chosen) | high |
| RemoteFilterSettings.filter_on | data-model → `remote_filter_settings.filter_on` | high |
| RemoteFilterSettings.countries[] | ADR-0003 country list (Intl + hand tables, not stored) | high |
| Country.code | ADR-0003 → ISO 3166-1 alpha-2; stored in `remote_filter_settings.country` / `.look_country` | high |
| Country.name, Country.flag | ADR-0003 → `Intl.DisplayNames` English name / preferred alias; flag derived from the code | high |
| chooseCountry.request.name, setLook.request.name | spec AC-05 (typed name); sad.md §8 aliases and flags; 100-char bound is a request guard (no column holds the typed text) | medium |
| setFilterOn.request.on | data-model → `remote_filter_settings.filter_on` | high |
| LookState.look | data-model → `remote_filter_settings.look_country` (+ `look_started_at`, not exposed) | high |
| SearchResult.location_filter.mode | sad.md §4 / data-model: none (country NULL, no active look), own, look (`look_started_at` ≥ visit start), off (`filter_on` false) | high |
| SearchResult.location_filter.country | data-model → `look_country` or `country` | high |
| SearchResult.hidden_count | sad.md §5 Snapshots / ADR-0002 (in-memory, not stored) | high |
| SearchResult.total, new_count | applied-skipped contract, narrowed to shown postings (ADR-0002, AC-07, AC-09) | high |
| SearchResult.marked_count, collection_empty, skills, snapshot_id | applied-skipped contract, unchanged | high |
| Posting.location_check | sad.md §5 domain verdict reason; spec AC-02 reason list and priority | high |
| Posting.* (other fields), Listing.*, LookAlike.* | applied-skipped contract, unchanged; `Listing.location_restriction` → `collector_listings.location_restriction`, now with "Anywhere" as stated (AC-10) | high |
| WaitingCount.waiting_count | applied-skipped contract, narrowed to the snapshot's filter (AC-09) | high |

No field lacks an origin. The only medium row is a request guard on typed text that is never stored.

## B. Drift checklist

| # | Check | Result |
|---|---|---|
| 1 | Endpoint ↔ model: every stored field the contract reads or writes is a `remote_filter_settings` column. Every column is reachable: `look_started_at` internally through search's active filter | ✓ |
| 2 | Error code ↔ repo: `VALIDATION_ERROR`, `FORBIDDEN_HOST`, `CROSS_SITE_REQUEST`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL`, `SEARCH_*` already exist. `REMOTE_FILTER_UNKNOWN_COUNTRY` is new, thrown as `AppError` by remote-filter (`core/errors.ts` pattern) | ✓ |
| 3 | Validation ↔ constraint: `CountryCode` `^[A-Z]{2}$` matches the alpha-2 list. `filter_on` is a NOT NULL boolean ↔ required `on: boolean`. `country` and `look_country` are nullable ↔ `oneOf [Country, null]` | ✓ |
| 4 | OpenAPI ↔ sequence: every §6 `alt`/`opt` branch with an HTTP edge has a response. Flow 1 nothing-shown ↔ `runSearch` 200 `all_hidden`. Flows 2/3 unknown name ↔ 400 `UnknownCountry`. Flow 4 off ↔ `setFilterOn` + mode `off`. Flow 5 waiting ↔ `getWaitingCount`. Flow 7 ↔ `LookAlike` note and marked view unchanged | ✓ |

## C. Back-feed coverage

| AC | Operation / response |
|---|---|
| AC-01 | `runSearch` (filter; hidden postings left out), `Listing.location_restriction` as stated |
| AC-02 | `Posting.location_check` + `LocationCheck` priority |
| AC-03 | `runSearch` description (open listings from enabled sources; best verdict) |
| AC-04 | `getRemoteFilterSettings` `first_open` (country null), `chooseCountry` 200, `LocationFilter.mode` none |
| AC-05 | `chooseCountry` / `setLook` 400 `REMOTE_FILTER_UNKNOWN_COUNTRY` |
| AC-06 | `setLook` start/end, `LocationFilter.mode` look, `runSearch` `look` example |
| AC-07 | `setFilterOn`, `SearchResult.hidden_count` / `total`, `LocationFilter.mode` off |
| AC-08 | `runSearch` `all_hidden` (total 0, hidden_count > 0; wins over nothing-left-to-review) |
| AC-09 | `getWaitingCount`, `SearchResult.new_count`, `Posting.is_new` note |
| AC-10 | `Listing.location_restriction` description (collector, no new operation) |
| AC-11 | `LookAlike` description; marked view unchanged, not restated |
| AC-12 | 403 `Forbidden` on every operation; no CORS |
| AC-13 | `chooseCountry` (switches the filter on) |

Every operation maps to a §4 user story:
- `getRemoteFilterSettings` → US-03, US-05
- `chooseCountry` → US-03
- `setFilterOn` → US-05
- `setLook` → US-04
- `runSearch`, `getNextPage` → US-01, US-02, US-05
- `getWaitingCount` → US-05

## Findings

No core finding failed, and there is one flag, below the pause threshold.

- **F-1 (flag, sequence gap, low):** `runSearch` / `getWaitingCount` 503 now also covers "location settings cannot be read". No §6 flow draws that branch. It is the same fail-closed rule applied-skipped set for marks (its F-4): a list built without the settings could hide nothing or the wrong postings. Kept in the contract, and noted here for `sequences` if Flow 1 is ever redrawn. No OQ: there is no spec change and no open decision.

## Reconcile log

- 2026-10-14: deriving the contract found that `look_visit_started_at` (data-model) would need remote-filter to know the current visit when a look starts, which is a remote-filter → search cycle. With the owner's approval it was renamed upstream to `look_started_at`, and search now passes its visit start to the active-filter query. Edited: `data-model.md`, the staged migration (re-verified), the data-model audit, and `sad.md` §4/§5/§6 notes.
