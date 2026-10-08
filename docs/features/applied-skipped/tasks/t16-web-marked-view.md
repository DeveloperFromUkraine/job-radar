---
id: T16
title: "Build the Show marked postings switch and the marked view with change, clear, at-risk confirm and cleared cards"
layer: "ui"
deps: ["T15"]
blocks: []
acs: ["AC-05", "AC-06", "AC-07"]
files_hint: ["apps/web/src/features/tracking/MarkedToggle.tsx", "apps/web/src/features/tracking/MarkedToggle.test.tsx", "apps/web/src/features/search/SearchList.tsx", "apps/web/src/features/search/queries.ts", "apps/web/src/routes/Home.test.tsx", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T16 — Build the Show marked postings switch and the marked view with change, clear, at-risk confirm and cleared cards

## Place in the sequence

- **Blocked by:** T15 — Show the save-error, posting-gone and nothing-left-to-review states on the main screen · **Blocks:** — · **Wave:** 4 (after its deps finish).
- **Lane:** shares files with T13, T14, T15 — serialized with them.

## Why (user story)

> **As an** owner
> **I want** to see the postings I marked, including closed ones, and change or clear a mark
> **So that** I can find a role I applied to when a recruiter replies, and fix a decision I regret
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

The place to find a role you applied to and to fix a decision.

## Inlined context

> NEW: MarkedToggle — A labelled switch, "Show marked postings", placed under SkillsField: a native `<input type="checkbox" role="switch">` inside a 44 px tall label. It is off on every visit and never remembered (AC-05). Turning it on runs `runMarkedView`; turning it off runs `runSearch`. Both use the skills field's text. It is disabled while either call is in flight.
>
> — `screens.md §SCR-01, NEW: MarkedToggle, verbatim` · full text: [screens.md](../screens.md)

> Marked view: default — summary "12 marked and 1 cleared"; "and N cleared" only when `cleared_count > 0`; mark Badge with "on 3 Oct"; MarkActions offering a change of mark plus Clear · closed card — Badge "Closed"; every source named, link only for an open listing · cleared card — Badge "Cleared", "Removed after 8 Oct", actions Applied / Skipped (no Clear) · at-risk confirm — Clear or Skipped on an applied card with `at_risk: true`: before any call, the actions turn into the warning "Without the applied mark, this posting will be removed at clean-up." with Continue and Cancel; Cancel sends nothing · changed — card stays in place with the new Badge, notice with Undo · cleared open — card stays until reload with "Not marked", notice "Mark cleared" with Undo · cleared closed — turns into cleared card in place · empty — "No marked postings." / "No marked postings match Go." · view expired — 410: re-run `runMarkedView`, "This list had expired and was reloaded." · switch off — notice closes, main list reloads.
>
> — `screens.md §SCR-01 Marked view, abridged` · full text: [screens.md](../screens.md)

> Search while the marked view is on reloads the marked view with the new skills (`runMarkedView`), and the switch stays on. It closes the Undo notice like any search (AC-03).
>
> — `screens.md §Source, owner decisions, verbatim` · full text: [screens.md](../screens.md)

> Phone layout: the marked view is usable at 360 px with no horizontal scrolling
>
> — `spec.md §6, Phone layout, abridged` · full text: [spec.md](../spec.md)

> **Hard rule:** Marks are TanStack Query mutations. A card leaves the list only after the server confirms the save (AC-14), with no optimistic removal. The Undo notice and its 8 s timer are client state on SCR-01. Undo puts the card back at its earlier position in the pages already shown.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Calls `runMarkedView`, `getNextMarkedPage` (`410 SEARCH_SNAPSHOT_EXPIRED`), `setMark`, `undoMark`; reads `MarkedResult.marked_count`, `cleared_count`, `MarkedPosting.status`, `listings[].url`, `mark_state.{mark, marked_at, at_risk, removed_after}`.

— `contracts/openapi.yaml, runMarkedView / getNextMarkedPage / MarkedPosting, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-05 — happy

> **Given** the owner has marked postings, some of which have since closed, and has cleared the marks of some closed postings (AC-07)
> **When** the owner turns on "Show marked postings"
> **Then** the list shows only marked postings, most recently marked first, each with its mark and the date it was set, and with the number of marked postings. Closed postings whose mark the owner cleared and that clean-up has not yet removed are shown too, labelled "Cleared, removed after <date>" with the applied and skipped actions, and counted separately ("and N cleared"). The owner's skills narrow the view as they narrow the main list. A closed posting is labelled "Closed" and names every source, with links only for listings still open. The order and the pages are fixed when the view loads, as for the main list (AC-12): a card whose mark the owner changes stays in place until the view is refreshed, and later pages never repeat or skip a posting. The switch starts off on every visit, and turning it off returns to the unmarked list.
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** a posting is shown in the marked postings
> **When** the owner changes its mark (applied to skipped or back) or clears it
> **Then** a changed mark replaces the old one (a posting has at most one mark) and the date updates. A cleared open posting returns to the main list and its counts in its publication-time position, and it counts as new only by the rule for new postings (first collected after the previous visit started), never because its mark was cleared. A cleared closed posting stays in the marked postings as AC-05 and AC-07 describe.
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a posting marked applied that clean-up would remove if it were not applied (it is past the collector's 60-day rule, AC-09)
> **When** the owner clears its mark or changes it to skipped
> **Then** before the change, the owner is told that without the applied mark the posting will be removed at clean-up. Once changed, it is kept until the end of the next calendar day (its grace day), and the owner can mark it applied again until then. Every closed posting whose mark the owner cleared, whatever its age, stays in the marked postings labelled "Cleared, removed after <the date clean-up will remove it>" until it is removed, and the owner can mark it again there. If a source offers the posting again, it is no longer due for removal and keeps its place by the normal rules.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `features/tracking/MarkedToggle.tsx` (+ test): native checkbox `role=switch`, 44 px label, disabled in flight
- [ ] `features/search/queries.ts`: a marked-view infinite query (separate key, starts off every visit)
- [ ] `features/search/SearchList.tsx`: marked mode rendering PostingCard's marked variant, in-place updates, at-risk confirm via MarkActions `confirm`, 410 reload, `showMarked()` for T15's action
- [ ] `routes/Home.test.tsx`: AC-05, AC-06, AC-07 paths
- [ ] `docs/design-system.md`: add the MarkedToggle inventory row

## Edge cases

| Case | Behaviour |
|---|---|
| Cancel on the at-risk confirm | Nothing sent; actions restored |
| Applied card not at risk | No confirm; change sent directly |
| Clear an open posting | Card stays as Not marked until reload; back in the main list later in date position, not New |
| Reload the page | Switch is off |
| No marked postings with skills Go | "No marked postings match Go." |

## Definition of Done

**Done when:** Home.test.tsx shows: the switch starts off, turning it on runs runMarkedView and lists marked cards with Badge and date, '12 marked and 1 cleared', Closed with links only for open listings, Cleared with 'Removed after 8 Oct'; change and clear update the card in place with Undo; an at_risk applied card asks Continue/Cancel before any call; 410 reloads with the expired message; turning it off reloads the main list.

- [ ] `MarkedToggle.test.tsx` and `Home.test.tsx` marked-view cases pass
- [ ] manual check at 360 px: no horizontal scroll (until search-postings §8 R6 is automated)
- [ ] design-system inventory updated
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
