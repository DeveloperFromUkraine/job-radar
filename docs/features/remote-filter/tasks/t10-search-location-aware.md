---
id: T10
title: "Make search's main list location-aware: active filter, verdicts before the snapshot, hidden/total/new counts, check reasons and the waiting count"
layer: "app"
deps: ["T07", "T08"]
blocks: ["T13"]
acs: ["AC-01", "AC-02", "AC-06", "AC-07", "AC-08", "AC-09", "AC-11"]
files_hint: ["apps/server/src/modules/search/app/deps.ts", "apps/server/src/modules/search/app/search.ts", "apps/server/src/modules/search/app/snapshots.ts", "apps/server/src/modules/search/app/present.ts", "apps/server/src/modules/search/app/pages.ts", "apps/server/src/modules/search/app/waiting.ts", "apps/server/src/modules/search/ports/routes.ts", "apps/server/test/search-location.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Make search's main list location-aware: active filter, verdicts before the snapshot, hidden/total/new counts, check reasons and the waiting count

## Place in the sequence

- **Blocked by:** T07 — Implement the settings use cases and active filter, T08 — Answer search's verdict question · **Blocks:** T13 — Prove the cross-context ACs and speed with the filter on · **Wave:** 5.
- **Lane:** own lane. Roadmap step 4 (match score) will change the same `search/app/`; whichever lands second rebases (sad §11).

## Why (user story)

> **As an** owner
> **I want** to see how many postings the filter hid, why the list may be empty, and to switch the filter off
> **So that** I always trust that the shorter list is the filter's doing and not a broken collector
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Where the verdict actually narrows the list (US-01, US-02) and where every count is made to agree with what is shown.

## Inlined context

> **Chosen:** Option 1 [On read, when search builds the snapshot]. Search asks remote-filter for the verdict of every matching posting. The snapshot keeps only the shown postings (fits and check) in order, with the hidden count and the country it was built for. Each distinct statement is read once per search. A new country, a one-off look, or switching the filter on or off runs a new search.
> The waiting count applies the verdict for the snapshot's own country, so "2 new waiting" counts only what the filter would show (AC-09).
>
> — `adr/0002, Decision outcome + Consequences, abridged` · full text: [ADR-0002](../adr/0002-decide-location-verdicts-on-read-when-search-builds-its-snapshot.md)

> ```
> └── modules/search/app/
>     ├── deps.ts                    + LocationReader (remote-filter's verdicts, replaceable in tests)
>     ├── search.ts                  asks the active filter for this visit (own country, a look, or off); filters by verdict before the snapshot;
>     │                              total / new / hidden / marked counts; check reason on each shown posting
>     ├── snapshots.ts               Snapshot + location { country, on }, hiddenCount
>     ├── present.ts                 Posting + location_check (reason or null)
>     ├── pages.ts                   next pages carry each posting's check reason
>     └── waiting.ts                 counts only postings the snapshot's filter would show
> ```
> A main-list snapshot now also records: the country it was filtered for, or none when the filter is off or no country is chosen; its hidden count. Its ids are only the shown postings, marked ones included, which pages drop as before.
>
> — `sad.md §5, Internal decomposition + Snapshots, abridged` · full text: [sad.md](../sad.md)

> Flow 1: Search → RF the owner's settings → RF: Poland, on → Collector: open postings with their listings → RF: verdicts of these postings for Poland today → Search keeps fits and check in order, counts hidden, new and total among shown. `alt` nothing shown and the filter hid some → empty page, hidden 12. Flow 4: RF → off → Search keeps every match, asks no verdict, hidden count none. Flow 5 `opt` owner switches the filter off in the same visit → new snapshot with the same previous-visit start → the 3 earlier hidden postings shown as new too. Flow 7: look-alike hints for the shown page only; the marked view never asks for a verdict.
>
> — `sad.md §6, Flows 1, 4, 5, 7, abridged` · full text: [sad.md](../sad.md)

> | Logging | Search's existing `search` log line gains `hidden` and `checked` counts and the country code. Statements are not logged one by one |
>
> — `sad.md §8, Logging, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Search response with the filter on — ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings and up to 20 skills (unchanged from search).
>
> — `spec.md §6, NFR row 1, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** a list built without the settings could hide nothing or the wrong things — `runSearch` / `getWaitingCount` answer 503 `SEARCH_COLLECTION_UNAVAILABLE` when the location settings cannot be read.
>
> — `contracts/api-sync-report.md §Findings F-1, abridged` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

Pattern to follow: `marksOf(deps)` in `search/app/deps.ts` — add `LocationReader { activeFilter(visitStartedAt); verdictsFor(postings, country, date) }` with a default built from remote-filter's `app/` exports, replaceable in tests (to simulate unreadable settings).

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/0002](../adr/0002-decide-location-verdicts-on-read-when-search-builds-its-snapshot.md)) and follow it. Do not guess.

## Data delta

No DB changes. Snapshots stay in memory (search ADR-0003); they gain `location { country, on }` and `hiddenCount`. Reads `search_state.visit_started_at` (already search's) to pass into `activeFilter`.

— `data-model.md §Scope + read-side table, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `runSearch` `POST /api/v1/search/snapshots` → `SearchResult` gains `hidden_count` (int ≥0; 0 with mode none or off), `location_filter { mode: none|own|look|off, country: Country|null }` (country = owner's when off; null when none); `total` / `new_count` count only shown, unmarked postings; each `Posting` gains `location_check: exception|hours_only|not_recognised|not_stated|null` (null when it fits or mode none/off). Empty-by-filter = 200 `total: 0`, `hidden_count > 0`. `503 SEARCH_COLLECTION_UNAVAILABLE` also when settings cannot be read.
- `getNextPage` → items carry the `location_check` decided at snapshot build.
- `getWaitingCount` → only postings the snapshot's own filter would show.
- These supersede the same three operations in `applied-skipped/contracts/openapi.yaml`; update the contract-pointer comments in `search/ports/routes.ts` and `search/app/present.ts` to this file.

— `contracts/openapi.yaml, operationIds runSearch / getNextPage / getWaitingCount + schemas SearchResult, LocationFilter, LocationCheck, abridged` · `api-sync-report.md §Scope, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** the owner's country is Poland, the filter is on, and open postings state "USA", "LATAM", "EMEA", "Europe", "Poland", "🇵🇱 Poland, 🇺🇦 Ukraine", "Worldwide" and "UTC-1 to UTC+3"
> **When** the owner opens the main screen
> **Then** the list shows the EMEA, Europe, Poland, flag-list, Worldwide and UTC-range postings, each with its location as the source stated it, and does not show the USA and LATAM postings
>
> — `spec.md §5, AC-01, verbatim (notes inlined in T03)` · full text: [spec.md](../spec.md)

### AC-02 — domain invariant

> **Given** the owner's country is Poland and open postings state nothing, "Helsinki", "Worldwide except Poland", and "United States, UTC-10 to UTC+14"
> **When** the owner opens the main screen
> **Then** all four stay in the list, each marked "check location" with the reason — location not stated / location not recognised / mentions an exception / only working hours fit — because a location the filter cannot read with confidence is never hidden
>
> — `spec.md §5, AC-02, verbatim (note inlined in T03)` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** the owner's country is Poland
> **When** they choose to see postings open to Germany
> **Then** the list shows the postings that fit or need a check for Germany under the same rules, the screen says it is showing postings open to Germany, the owner's saved country stays Poland, and the next time the main screen is opened it filters for Poland again; an owner who has not chosen a country yet can still look at Germany this way, and afterwards is back to the unfiltered list with the prompt to choose (AC-04)
>
> — `spec.md §5, AC-06, verbatim (note inlined in T07)` · full text: [spec.md](../spec.md)

### AC-07 — happy

> **Given** the filter for Poland hides 38 of 140 open postings that match the owner's skills
> **When** the list is shown
> **Then** the owner sees "102 postings — 38 hidden, not open to Poland", pages through those 102 (search AC-15), and has one action to switch the filter off; switching it off shows all 140 without any "check" or hidden distinction, and the filter stays off on the next opening until the owner switches it on, with the screen saying the location filter is off and offering to switch it on
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — error

> **Given** the owner's skills match 12 open postings and the filter hides all 12
> **When** the owner searches
> **Then** they see that no posting open to Poland matches, that the filter hid 12, and one action to switch the filter off — not only the action to clear the skills
>
> > When hidden and marked postings together empty the list, this message wins over applied-skipped's "nothing left to review" (applied-skipped AC-13) whenever the filter hid at least one posting, since switching the filter off is the only action that brings something back; with nothing hidden, applied-skipped AC-13 applies unchanged.
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** the filter is on and, since the list was loaded, the collector added 5 postings, 3 of them not open to the owner's country
> **When** the owner looks at the waiting count and then refreshes
> **Then** the screen says 2 new postings are waiting, the refreshed list shows those 2 as new, and the "new" count and the hidden count agree with what the list shows; a hidden posting first collected since the previous visit is shown as new if the owner switches the filter off during the same visit
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — cross-context

> **Given** the owner marked a posting at Acme applied, and a look-alike Acme posting that states "USA" is open
> **When** the owner opens the main screen with the filter on for Poland, and then the marked view
> **Then** the look-alike posting is hidden like any posting not open to Poland (its earlier-mark hint shows only when it is shown), and the marked view lists every marked posting whatever its location, unchanged by the filter
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/app/deps.ts`: `LocationReader` + `locationOf(deps)` default from remote-filter `app/` exports
- [ ] `search/app/search.ts`: active filter for the visit; verdicts for every matching posting (marked too); snapshot = shown ids in order; `hidden_count` = unmarked not-open; `total` / `new_count` among shown unmarked; settings unreadable → 503; log line gains `hidden`, `checked`, country
- [ ] `snapshots.ts` (location + hiddenCount), `present.ts` (`location_check`), `pages.ts` (carry reasons), `waiting.ts` (snapshot's own filter)
- [ ] `search/ports/routes.ts` + `present.ts`: contract pointers to this feature's `openapi.yaml`
- [ ] `apps/server/test/search-location.integration.test.ts` with seeded postings (`seedOpenPostings` + listing overrides) and a fake clock; validate responses against the contract
- [ ] Existing search suites stay green (no country chosen → mode `none`, unchanged lists)

## Edge cases

| Case | Behaviour |
|---|---|
| No country, no look | mode `none`; every match; `location_check` null; `hidden_count` 0 |
| Filter off | mode `off`; no verdict asked; `hidden_count` 0 |
| All matches hidden | 200, `total: 0`, `hidden_count > 0` (AC-08) |
| Marked + hidden empty the list | `hidden_count > 0` still reported so the filter message wins |
| Settings unreadable | 503 `SEARCH_COLLECTION_UNAVAILABLE` |
| Look from an earlier visit | ignored → owner's own mode |
| Marked view | never asks for a verdict (AC-11) |

## Definition of Done

**Done when:** `search-location.integration.test.ts` passes: AC-01/02 list and reasons, 102/38/140 counts and off (AC-07), all-hidden (AC-08), 2 waiting + new after refresh + new-when-switched-off (AC-09), Germany look and its end (AC-06), hidden look-alike with no hint and marked view unchanged (AC-11) — every response valid against the contract; existing search suites green.

- [ ] `search-location.integration.test.ts` passes and `search-*.integration.test.ts` stay green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
