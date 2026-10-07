---
id: T14
title: "Wire marking and the 8-second Undo notice into the main list"
layer: "ui"
deps: ["T13"]
blocks: ["T15"]
acs: ["AC-01", "AC-03", "AC-04", "AC-12"]
files_hint: ["apps/web/src/features/tracking/mutations.ts", "apps/web/src/features/tracking/UndoNotice.tsx", "apps/web/src/features/tracking/UndoNotice.test.tsx", "apps/web/src/features/search/SearchList.tsx", "apps/web/src/features/search/queries.ts", "apps/web/src/routes/Home.test.tsx"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T14 — Wire marking and the 8-second Undo notice into the main list

## Place in the sequence

- **Blocked by:** T13 — Add the web tracking client, the MarkActions component and PostingCard's look-alike line, marked variant and actions slot · **Blocks:** T15 — Show the save-error, posting-gone and nothing-left-to-review states on the main screen · **Wave:** 2 (after its deps finish).
- **Lane:** shares files with T15, T16 — serialized with them.

## Why (user story)

> **As an** owner
> **I want** to mark a posting applied after I apply to it
> **So that** it leaves my list and I never review it again
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to undo a mark in the moment after I set it
> **So that** a mis-click doesn't hide a posting I wanted
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The moment-to-moment loop: press, see it leave, undo a mis-click.

## Inlined context

> marked: `setMark` 200 (AC-01, AC-02). The card leaves the list, the count drops by one (and "· N new" too if the card was new), and the notice "Marked applied" / "Marked skipped" with Undo shows for 8 s. It closes sooner on the next mark, search, switch or reload (AC-03). A new notice replaces the old one, and Undo covers only the latest change · marking: both disabled, card stays, never leaves before the 200 · undo pending: Undo disabled · undone: the card returns to its earlier place in the pages already shown, with its New badge, counts restored, notice closes · undo refused (409): nothing reverted; the notice changes to the API message with the action "Show marked postings" · marked elsewhere: cards and counts on screen stay until refresh or search.
>
> — `screens.md §SCR-01 Main list, states marking → undo refused + marked elsewhere, abridged` · full text: [screens.md](../screens.md)

> Undo window: the Undo notice shows for 8 s, and closes sooner on the next mark, search, switch of the marked postings or reload — component test with a controlled clock
>
> — `spec.md §6, Undo window, verbatim` · full text: [spec.md](../spec.md)

> UI data access: TanStack Query: mutations for marks; search's infinite list is never refetched while shown (AC-12).
>
> — `sad.md §8, UI data access, abridged` · full text: [sad.md](../sad.md)

> Undo covers the latest change only. Spec §8's question is closed with its default, and AC-03 stands as written.
>
> — `screens.md §Source, owner decisions, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** Marks are TanStack Query mutations. A card leaves the list only after the server confirms the save (AC-14), with no optimistic removal. The Undo notice and its 8 s timer are client state on SCR-01. Undo puts the card back at its earlier position in the pages already shown.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Calls `setMark` and `undoMark` (T13 client). Handles here: `200 MarkState`, `409 TRACKING_MARK_CHANGED_ELSEWHERE`. (404/503 handling is T15.)

— `contracts/openapi.yaml, setMark / undoMark, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** an open posting is in the owner's list
> **When** the owner marks it applied
> **Then** it leaves the list at once and the number of postings shown drops by one, a notice says "Marked applied" with an Undo action, and the posting does not appear in the owner's list again (on later pages, on the next search or visit, or after job-radar restarts) unless the owner clears or undoes the mark
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — happy

> **Given** the owner has just marked a posting, changed its mark or cleared it, and the notice with Undo is showing (it shows for 8 seconds and closes sooner when the owner marks or changes another posting, searches, turns the marked postings on or off, or reloads; once it closes, Undo is no longer offered and the mark is changed from the marked postings)
> **When** the owner presses Undo
> **Then** the posting returns exactly to its earlier state (unmarked, or its previous mark with that mark's original date) and to its place in the list, the count is restored, and the posting keeps its "new" flag if it had one
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** the owner set a mark in one window, and since then that posting's mark was changed or cleared from any window, even back to the same mark
> **When** the owner presses Undo in the first window
> **Then** the mark is not reverted, because an undo only reverses a mark that nothing has changed since, and the owner is told the mark changed elsewhere and can see the current mark in the marked postings
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** the owner has 50 postings on screen and, since the list was loaded, has marked some of them, or marks were set or cleared in another window
> **When** the owner asks for more, or a waiting count is shown
> **Then** marks are checked as each page loads: a later page leaves out postings marked since the list was loaded and includes postings whose mark was cleared since, in their publication-time position, and no unmarked posting that belonged after the last one shown is skipped. Cards marked in another window stay on screen, and this window's counts do not change, until the owner refreshes or searches (as search AC-16 does for a posting that closes while on screen). The count of postings and the count of new postings drop as the owner marks postings in this window, and the number of new postings waiting counts only unmarked ones.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `features/tracking/mutations.ts`: `useSetMark`, `useUndoMark` (TanStack mutations; update the cached pages in place — remove / reinsert at the saved index — never refetch)
- [ ] `features/tracking/UndoNotice.tsx` (+ test with fake timers): sticky bottom InlineBanner `info` with Undo, 8 s, replaced by the next notice
- [ ] `features/search/SearchList.tsx`: pass MarkActions into each card, adjust `total` / `new_count` on 200, own the notice, close it on search / switch
- [ ] `routes/Home.test.tsx`: the flows above with contract examples

## Edge cases

| Case | Behaviour |
|---|---|
| Second mark while the first notice shows | New notice replaces it; Undo now covers only the second |
| Undo after 8 s | Not offered |
| Card was New | Undo restores the New badge and `· N new` |
| Undo 409 | Nothing reverted; message + Show marked postings (AC-04) |
| Mark changed in another window | This window's cards and counts stay until refresh/search (AC-12) |

## Definition of Done

**Done when:** Home.test.tsx (contract-example mocks) shows: card leaves and counts drop only after setMark 200; the notice shows 8 s with a fake clock and closes early on the next mark/search/switch; Undo restores the card to its place with its New badge and counts; a 409 shows the changed-elsewhere message with Show marked postings; the infinite list is never refetched.

- [ ] `UndoNotice.test.tsx` passes with a controlled clock
- [ ] `Home.test.tsx` covers AC-01, AC-03, AC-04 paths
- [ ] no optimistic removal (asserted: card present while the mutation is pending)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
