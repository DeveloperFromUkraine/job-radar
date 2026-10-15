---
id: T12
title: "Wire the filter into the main list: re-search on change, hidden count in the summary, the check-location mark, the filter's empty message and the marked view"
layer: "ui"
deps: ["T11"]
blocks: []
acs: ["AC-02", "AC-07", "AC-08", "AC-09", "AC-11"]
files_hint: ["apps/web/src/features/search/SearchList.tsx", "apps/web/src/features/search/PostingCard.tsx", "apps/web/src/features/search/PostingCard.test.tsx", "apps/web/src/features/search/SearchList.test.tsx", "apps/web/src/features/remote-filter/LocationCheck.tsx", "apps/web/src/App.tsx"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Wire the filter into the main list: re-search on change, hidden count in the summary, the check-location mark, the filter's empty message and the marked view

## Place in the sequence

- **Blocked by:** T11 — Add the web client, LocationFilterBar and CountryChoice · **Blocks:** — · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to see how many postings the filter hid, why the list may be empty, and to switch the filter off
> **So that** I always trust that the shorter list is the filter's doing and not a broken collector
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The list side of SCR-01: what the owner reads after the bar changes the filter (also US-02's mark).

## Inlined context

> | own | The summary reads "102 postings · 2 new — 38 hidden, not open to Poland"; the hidden part is left out when `hidden_count` is 0. Every card shows each listing's location as the source stated it | SearchList (summary, extended) |
> | check mark | A card's `location_check` is set (AC-02). A Badge "Check location" (tone `notice`) with one reason line: "Mentions an exception" / "Only working hours fit" / "Location not recognised" / "Location not stated". There is no action of its own | PostingCard (check line, extended), Badge (notice) |
> | off | The summary has no hidden part, and no card carries a check mark | — |
> | look | The summary and the empty message name Germany | — |
> | filter hid everything | `runSearch` 200 with `total: 0` and `hidden_count > 0` (AC-08). "No posting open to Poland matches. The location filter hid 12." with the actions "Switch filter off" and "Clear skills" (or "Back to Poland" during a look). This wins over "nothing left to review" whenever something was hidden | SearchList (empty, extended), Button ×2 |
> | empty, nothing hidden | `total: 0` with `hidden_count: 0`. The applied-skipped and search-postings messages are unchanged (applied-skipped AC-13) | — |
> | waiting | the count is already only what the filter shows (AC-09). Otherwise unchanged | InlineBanner (info, "Refresh") |
> | list error | `runSearch` / `getNextPage` / `getWaitingCount` 503. This now also covers settings that cannot be read. Unchanged banner with Retry | InlineBanner (error, Retry) |
> | marked view on | The "Show marked postings" switch is on (AC-11). The location bar is hidden and the marked view is unchanged by the filter. A look stays active underneath and is shown again when the switch goes off | MarkedToggle (on) |
>
> Component tree: App shell › ProblemMarker › SkillsField › NEW: LocationFilterBar (with NEW: CountryChoice when open) › MarkedToggle › summary line › waiting notice › PostingCard list (each with MarkActions, and the check mark when set) › show-more › Undo notice. Any filter change … is followed by `runSearch` with the field's skills. The list reloads from the top with SearchList's existing loading state (ADR-0002).
>
> — `screens.md §SCR-01, Location bar and list (list rows) + component tree, abridged` · wireframes 01-b, 01-c, 01-e: [screens.md](../screens.md)

> | Untrusted source content | Location statements and reasons are rendered as React text only, the same as search AC-09 |
>
> — `sad.md §8, Untrusted source content, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([screens.md](../screens.md) · [openapi.yaml](../contracts/openapi.yaml) · [spec.md](../spec.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `SearchResult.total`, `new_count`, `hidden_count`, `location_filter { mode, country }` and `Posting.location_check` (enum `exception | hours_only | not_recognised | not_stated | null`) from `runSearch` / `getNextPage`; `getWaitingCount` unchanged in shape. Types added in T11.

— `contracts/openapi.yaml, schemas SearchResult / Posting / LocationCheck, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-02 — domain invariant

> **Given** the owner's country is Poland and open postings state nothing, "Helsinki", "Worldwide except Poland", and "United States, UTC-10 to UTC+14"
> **When** the owner opens the main screen
> **Then** all four stay in the list, each marked "check location" with the reason — location not stated / location not recognised / mentions an exception / only working hours fit — because a location the filter cannot read with confidence is never hidden
>
> — `spec.md §5, AC-02, verbatim (note inlined in T03)` · full text: [spec.md](../spec.md)

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
> — `spec.md §5, AC-08, verbatim (note inlined in T10)` · full text: [spec.md](../spec.md)

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

- [ ] `features/remote-filter/LocationCheck.tsx`: Badge "Check location" (tone `notice`) + reason line
- [ ] `features/search/PostingCard.tsx`: show LocationCheck when `location_check` is set
- [ ] `features/search/SearchList.tsx`: summary hidden part ("— N hidden, not open to <country>"); filter empty message with "Switch filter off" / "Clear skills" (or "Back to <own>" during a look), winning over nothing-left-to-review when `hidden_count > 0`; re-search after any filter mutation
- [ ] `App.tsx` (or the main-screen composition): place LocationFilterBar under SkillsField; hide it while the marked view is on
- [ ] Tests: `PostingCard.test.tsx` (four reasons, none when null), `SearchList.test.tsx` (summary with/without hidden part, all-hidden message, off, look naming Germany, marked view hides the bar)

## Edge cases

| Case | Behaviour |
|---|---|
| `hidden_count` 0 in mode own | summary has no hidden part |
| `total` 0, `hidden_count` 0 | applied-skipped / search empty messages unchanged |
| `total` 0, `hidden_count` > 0, all others marked | filter message wins (AC-08 note) |
| Look at Germany, all hidden | message names Germany; action "Back to Poland" |
| Marked view toggled on during a look | bar hidden; look returns when toggled off |

## Definition of Done

**Done when:** `PostingCard.test.tsx` and `SearchList.test.tsx` pass for the four check reasons, the summary with and without its hidden part, the filter's empty message winning over nothing-left-to-review, the off and look states, and the bar hidden in the marked view.

- [ ] web tests pass (`pnpm --filter @job-radar/web test`)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
