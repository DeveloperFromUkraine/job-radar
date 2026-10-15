---
id: T15
title: "Show the save-error, posting-gone and nothing-left-to-review states on the main screen"
layer: "ui"
deps: ["T14"]
blocks: ["T16"]
acs: ["AC-13", "AC-14", "AC-15"]
files_hint: ["apps/web/src/features/search/SearchList.tsx", "apps/web/src/features/search/PostingCard.tsx", "apps/web/src/routes/Home.test.tsx"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T15 — Show the save-error, posting-gone and nothing-left-to-review states on the main screen

## Place in the sequence

- **Blocked by:** T14 — Wire marking and the 8-second Undo notice into the main list · **Blocks:** T16 — Build the Show marked postings switch and the marked view with change, clear, at-risk confirm and cleared cards · **Wave:** 3 (after its deps finish).
- **Lane:** shares files with T13, T14, T16 — serialized with them.

## Why (user story)

> **As an** owner
> **I want** the counts, the next pages and the empty state to account for my marks
> **So that** what the list tells me matches what I see
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Every way a mark can fail, and the inbox-zero state, told plainly.

## Inlined context

> save error: `setMark` / `undoMark` 503 `TRACKING_MARKS_UNAVAILABLE` or 500 (AC-14). The card keeps its earlier state, and the banner sits in the card above the actions with the API message and Retry, which repeats the same call. For a failed Undo, the banner replaces the notice's text, and the notice stays until Retry succeeds or the owner dismisses it by the usual triggers · posting gone: 404 `TRACKING_POSTING_NOT_FOUND` (AC-15). The card leaves without a mark being recorded, the count drops by one, and the notice says "This posting is no longer in job-radar." with no Undo · nothing left to review: `runSearch` 200 with `total: 0` and `marked_count > 0` (AC-13). "Nothing left to review. You've marked 3 matching postings." with one action, "Show marked postings", which turns the switch on · empty: `total: 0` with `marked_count: 0`. Search-postings' messages are unchanged.
>
> — `screens.md §SCR-01 Main list, states save error / posting gone / nothing left / empty, abridged` · full text: [screens.md](../screens.md)

> **Dependency note:** "Show marked postings" turns the switch on; until T16 lands the MarkedToggle, wire the action to a `showMarked()` callback SearchList owns, which T16 implements.
>
> — `tasks breakdown 2026-10-07, T15→T16 handoff (no upstream source)`

> **Hard rule:** Marks are TanStack Query mutations. A card leaves the list only after the server confirms the save (AC-14), with no optimistic removal. The Undo notice and its 8 s timer are client state on SCR-01. Undo puts the card back at its earlier position in the pages already shown.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Handles `setMark` / `undoMark` 404 and 503 (and 500 as 503), and `runSearch` `nothing_left` (`total: 0`, `marked_count > 0`).

- `404 TRACKING_POSTING_NOT_FOUND` "This posting is no longer in job-radar." (AC-15)
- `409 TRACKING_MARK_CHANGED_ELSEWHERE` "This mark was changed elsewhere, so it was not undone. See the marked postings for its current mark." (undo only, AC-04)
- `503 TRACKING_MARKS_UNAVAILABLE` "Job-radar could not save your mark just now. Try again." (AC-14)

— `contracts/openapi.yaml, components.responses PostingNotFound / MarksUnavailable + undoMark 409, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-13 — error

> **Given** no unmarked open posting matches the owner's skills (or no unmarked open posting exists, with no skills), and at least one matching open posting is marked
> **When** the owner searches or opens the main screen
> **Then** the owner sees that nothing is left to review, with how many matching open postings they have marked and one action to show the marked postings, instead of the "nothing matches" or "first collection has not brought postings yet" message. When no open posting matches at all, marked or not, search AC-11's messages apply unchanged.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** job-radar cannot save marks at the moment
> **When** the owner marks a posting, presses Undo, changes a mark or clears it
> **Then** the screen keeps its earlier state, the owner sees a plain-language message with a retry action, and nothing is shown that was not saved
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — error

> **Given** a posting on screen was removed by clean-up after the list was loaded
> **When** the owner marks it or changes its mark
> **Then** the owner is told the posting is no longer in job-radar, and its card leaves the list without any mark being recorded
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `PostingCard.tsx`: an in-card error banner slot above the actions (InlineBanner `error`, Retry)
- [ ] `SearchList.tsx`: map 503/500 → in-card banner (or notice text for a failed Undo); 404 → remove card, drop count, gone notice; render the nothing-left state from `marked_count`
- [ ] `routes/Home.test.tsx`: AC-13, AC-14, AC-15 paths with contract examples

## Edge cases

| Case | Behaviour |
|---|---|
| Retry succeeds | Banner goes; normal marked state + notice |
| Retry fails again | Banner stays, earlier state kept |
| 404 on Undo | Gone notice; card does not return |
| Nothing left and a skills search with no match | Search AC-11 message, not nothing-left |

## Definition of Done

**Done when:** Home.test.tsx shows: a 503 on setMark or undoMark keeps the earlier state with the API message and Retry that repeats the call; a 404 removes the card with 'This posting is no longer in job-radar.' and no Undo; runSearch nothing_left example renders 'Nothing left to review. You've marked 3 matching postings.' with one Show marked postings action; marked_count 0 keeps search's messages.

- [ ] `Home.test.tsx` covers AC-13, AC-14, AC-15
- [ ] nothing shown that was not saved (asserted on 503)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
