---
status: draft
feature_size: "S"
tool: code
updated_at: "2026-10-14"
---

# Screens — remote-filter

> The canonical **screen manifest**: every screen in every state. `screens` produces it between `api` and `tasks`. `tasks` cites its SCR ids and states, `implement` builds to it, and `review` checks against it. Downstream reads only this manifest.

## Source

- **Tool:** code (from `docs/design-system.md`). No design-tool MCP is used.
- **File:** the wireframes are inline below and show the 360 px phone layout. From `md:` the location bar's actions sit on one line beside its text, and the card keeps search-postings' second column.

States are derived from:
- spec §5: AC-01 – AC-09, AC-11, AC-13. AC-10 and AC-12 have no screen of their own: they are the collector's reading and the access rule.
- sad.md §6 Flows 1–7 (`alt`/`else`/`opt` branches);
- `contracts/openapi.yaml` responses: `REMOTE_FILTER_UNKNOWN_COUNTRY`, `SEARCH_COLLECTION_UNAVAILABLE`, 500;
- the ux-flows US-01 – US-05 branches.

## Screens

### SCR-01 — Main screen

This is the applied-skipped main screen with a location bar under the skills field, a hidden count in the summary line, a "check location" mark on uncertain cards, and the filter's empty-list message. Every applied-skipped and search-postings SCR-01 state (loading, validation, error, show more, list expired, waiting, marks, Undo, look-alike, marked view) is unchanged unless a row below restates it.

Component tree: App shell › ProblemMarker (when flagged) › SkillsField › NEW: LocationFilterBar (with NEW: CountryChoice when open) › MarkedToggle › summary line › waiting notice › PostingCard list (each with MarkActions, and the check mark when set) › show-more › Undo notice.

Any filter change (choose or change the country, switch on or off, start or end a look) is followed by `runSearch` with the field's skills. The list reloads from the top with SearchList's existing loading state (ADR-0002). The bar's text always comes from `SearchResult.location_filter`, so it describes the list on screen, never a setting not yet applied.

#### Location bar and list

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| settings loading | `getRemoteFilterSettings` in flight on opening. The bar shows a one-line placeholder, and the list loads as usual | SkeletonRow (one line) | — |
| settings error | `getRemoteFilterSettings` 500. The bar's place holds the API message with Retry. The list still loads, because search reads the settings itself; only the bar's actions wait | InlineBanner (error, Retry) | — |
| no country | `location_filter.mode: none` (AC-04). The bar reads "Choose your country to hide roles you can't take from there", with the actions "Choose country" and "Look at another country". The list shows every matching posting, with no check marks and no hidden count | NEW: LocationFilterBar, Button ×2 | wireframe 01-a |
| own | `mode: own` (AC-01, AC-07). The bar reads "Open to 🇵🇱 Poland", with the actions "Change", "Other country" and "Switch off". The summary reads "102 postings · 2 new — 38 hidden, not open to Poland"; the hidden part is left out when `hidden_count` is 0. Every card shows each listing's location as the source stated it | LocationFilterBar, Button ×3, SearchList (summary, extended) | wireframe 01-b |
| check mark | A card's `location_check` is set (AC-02). A Badge "Check location" (tone `notice`) with one reason line: "Mentions an exception" / "Only working hours fit" / "Location not recognised" / "Location not stated". There is no action of its own: the owner reads the location through the listing's source link (ux-flows) | PostingCard (check line, extended), Badge (notice) | wireframe 01-b |
| off | `mode: off` (AC-07). The bar reads "Location filter is off", with the action "Switch on". The summary has no hidden part, and no card carries a check mark. The state stays across openings until switched on | LocationFilterBar, Button | wireframe 01-c |
| look | `mode: look` (AC-06). The bar reads "Showing postings open to 🇩🇪 Germany", with the action "Back to Poland", or "Back to all postings" when no country is chosen. The summary and the empty message name Germany. The look survives search, refresh, reload and the marked view, and ends on Back or a new visit | LocationFilterBar, Button | wireframe 01-d |
| switching | `setFilterOn` / `setLook` (end) in flight. The pressed action is pending and the bar's other actions are disabled. The list stays until the new search answers | Button (pending) | — |
| switch error | `setFilterOn` / `setLook` 500. The bar keeps its earlier state and shows the API message with Retry under its text | InlineBanner (error, Retry) | — |
| filter hid everything | `runSearch` 200 with `total: 0` and `hidden_count > 0` (AC-08). "No posting open to Poland matches. The location filter hid 12." with the actions "Switch filter off" and "Clear skills" (or "Back to Poland" during a look). This wins over "nothing left to review" whenever something was hidden | SearchList (empty, extended), Button ×2 | wireframe 01-e |
| empty, nothing hidden | `total: 0` with `hidden_count: 0`. The applied-skipped and search-postings messages are unchanged (applied-skipped AC-13) | as applied-skipped 01-d / search 01-d | — |
| waiting | `getWaitingCount` 200; the count is already only what the filter shows (AC-09). Otherwise unchanged. After a refresh, those postings are New, and the counts agree with the list | InlineBanner (info, action "Refresh") | search 01-e |
| list error | `runSearch` / `getNextPage` / `getWaitingCount` 503. This now also covers settings that cannot be read (contract F-1). Unchanged banner with Retry | InlineBanner (error, Retry) | search 01-c |
| marked view on | The "Show marked postings" switch is on (AC-11). The location bar is hidden and the marked view is unchanged by the filter. A look stays active underneath and is shown again when the switch goes off | MarkedToggle (on) | — |

#### NEW: CountryChoice (opens in place inside the bar)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| open | "Choose country" / "Change" (label "Your country") or "Look at another country" / "Other country" (label "Look at postings open to"). A labelled text input with suggestions from `countries` (name and flag), plus the buttons "Save" or "Look", and "Cancel". Enter submits and Escape cancels | NEW: CountryChoice, Button ×2 | wireframe 01-f |
| saving | `chooseCountry` / `setLook` in flight. The submit button is pending, and the input stays editable | Button (pending) | — |
| unknown name | 400 `REMOTE_FILTER_UNKNOWN_COUNTRY` (AC-05). "No country matches that name." sits under the input in `text-danger` with `aria-invalid`; the list and the saved country are unchanged. Validation is live once flagged, per the conventions | CountryChoice (error) | wireframe 01-f |
| saved | `chooseCountry` 200: the choice closes and the list reloads filtered, with the filter on even if it was off (AC-04, AC-13). `setLook` 200: the choice closes and the list reloads in look mode (AC-06) | LocationFilterBar | as 01-b / 01-d |
| save error | `chooseCountry` / `setLook` 500. The API message with Retry shows inside the choice, which stays open with the typed name | InlineBanner (error, Retry) | — |
| cancelled | Cancel or Escape. The choice closes and nothing is sent | — | — |

```text
01-a  no country                        01-b  own (filter on for Poland)
+------------------------------------+  +------------------------------------+
| [ Skills: Go, TypeScript ][Search] |  | [ Skills: Go ]             [Search]|
| Choose your country to hide roles  |  | Open to 🇵🇱 Poland                  |
| you can't take from there          |  | [Change] [Other country] [Switch   |
| [Choose country] [Look at another  |  |                              off]  |
|  country]                          |  | [ ] Show marked postings           |
| [ ] Show marked postings           |  | 102 postings · 2 new — 38 hidden,  |
| 140 postings · 3 new               |  | not open to Poland                 |
| +--------------------------------+ |  | +--------------------------------+ |
| | Senior Backend Engineer   NEW  | |  | | Backend Engineer               | |
| | Example Co · 2 h ago           | |  | | Example Co · 5 h ago           | |
| | Jobicy · USA                   | |  | | [Check location]               | |
| | [Applied]        [Skipped]     | |  | | Mentions an exception          | |
| +--------------------------------+ |  | | Jobicy · Worldwide except      | |
+------------------------------------+  | |          Poland                | |
                                        | | [Applied]        [Skipped]     | |
                                        | +--------------------------------+ |
                                        +------------------------------------+

01-c  off                               01-d  look at Germany
+------------------------------------+  +------------------------------------+
| Location filter is off             |  | Showing postings open to 🇩🇪 Germany|
| [Switch on]                        |  | [Back to Poland]                   |
| 140 postings · 2 new               |  | 99 postings — 41 hidden, not open  |
| (cards without check marks)        |  | to Germany                         |
+------------------------------------+  +------------------------------------+

01-e  filter hid everything             01-f  country choice (unknown name)
+------------------------------------+  +------------------------------------+
| Open to 🇵🇱 Poland                  |  | Your country                       |
| No posting open to Poland matches. |  | [ Polnd                         ]  |
| The location filter hid 12.        |  | No country matches that name.      |
| [Switch filter off] [Clear skills] |  | [Save]  [Cancel]                   |
+------------------------------------+  +------------------------------------+
```

Every action in the bar and the choice is at least 44×44 px; on phones the actions wrap with `gap-2` and never scroll sideways (spec §6 Phone layout).

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| LocationFilterBar | No inventory component shows a persistent filter state with its own actions. InlineBanner is for notices and errors, MarkedToggle is a single switch, and the filter has four modes with one to three actions each. It composes Button and InlineBanner | pending |
| CountryChoice | SkillsField is bound to the skills search (its submit runs a search and its validation is the skills check). The country input needs suggestions from `countries` (a native `<datalist>`) and the server's unknown-name answer. It composes Button and InlineBanner, and follows SkillsField's error pattern (`aria-describedby`, `aria-invalid`) | pending |

PostingCard (check line), SearchList (hidden part of the summary, filter empty message) and Badge (existing `notice` tone) are extended, not new.
