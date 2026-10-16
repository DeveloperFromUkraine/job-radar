---
id: T12
title: "Add the realness switch to the main screen and offer best match first without a profile"
layer: "ui"
deps: ["T11"]
blocks: []
acs: ["AC-05", "AC-10", "AC-11"]
files_hint: ["apps/web/src/api/realness.ts", "apps/web/src/features/realness/queries.ts", "apps/web/src/features/realness/RealnessSwitch.tsx", "apps/web/src/features/realness/RealnessSwitch.test.tsx", "apps/web/src/routes/Home.tsx", "apps/web/src/routes/Home.realness.test.tsx", "apps/web/src/features/matching/ScoringNotice.tsx", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Add the realness switch to the main screen and offer best match first without a profile

## Place in the sequence

- **Blocked by:** T11 — Show the reason line on posting cards (ReasonLine + api types) · **Blocks:** nothing · **Wave:** 2.
- **Lane:** shares `docs/design-system.md` with T11 — serialized.

## Why (user story)

> **As a** owner
> **I want** to switch the realness penalty off and on again
> **So that** I can see the plain best-match order when I doubt the signals
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task lets the owner see the plain best-match order whenever they doubt the signals, and makes realness useful before a profile exists.

## Inlined context

> | realness off | `realness_on: false` (AC-10) | RealnessSwitch off; no ReasonLine on any card, in either order | wireframe C |
> | switching (saving) | Owner flips the switch: `setRealnessOn` then `runSearch` (flow 2) | RealnessSwitch disabled while saving and while the list reloads, as OrderSwitch is during `list.isFetching`; the list stays visible with kept previous data | wireframe C (switch disabled) |
> | save error | `setRealnessOn` → 503 `REALNESS_SETTINGS_UNAVAILABLE` or any failure (AC-11) | RealnessSwitch back to its previous state; InlineBanner `error` directly under the switch row: title "Your realness choice was not saved.", body = API `message`, Retry repeats the same change; the list is unchanged | wireframe D |
> | no profile, best match | `has_profile: false`, `order: best_match` (ADR-0003, AC-05) | OrderSwitch now shown without a profile; ScoringNotice no-profile line gains one sentence: "Until you set up a profile, best match first puts postings with fewer realness signals first."; cards carry "Lowered" lines | wireframe E |
> | loading | First list load | Switch row not rendered until the first result arrives (it reads `realness_on` from `SearchResult`, as OrderSwitch reads `order`); SkeletonRow list as today | — (unchanged loading) |
> | marked view | "Show marked postings" on | RealnessSwitch hidden, as OrderSwitch is; marked cards carry no ReasonLine | — (unchanged marked view) |
> | realness unreadable | Server fails open: `realness: null` everywhere, `realness_on` as last known (sad.md §8, flow 5) | Switch shows the reported state; no ReasonLine. No banner: the list is complete and ordered by score | wireframe C (lines absent) |
>
> — `screens.md, SCR-01 states (switch rows), verbatim` · full text: [screens.md](../screens.md)

> - A native checkbox with `role="switch"` inside a 44 px label, the same pattern as MarkedToggle. Label: "Lower stale postings". Its accessible description is "Moves postings with realness signals lower in best match first".
> - It sits in the controls row after OrderSwitch and before MarkedToggle. The row wraps with `gap-2` on phones.
>
> — `screens.md, RealnessSwitch, verbatim` · full text: [screens.md](../screens.md)

> - PostingCard gains a reason slot under the match slot.
> - OrderSwitch shows without a profile (Home.tsx condition).
> - ScoringNotice's no-profile state gains the best-match sentence when `order` is `best_match`.
>
> — `screens.md, Changed existing components, verbatim` · full text: [screens.md](../screens.md)

> **Chosen:** option 1. It meets AC-05 as written and makes realness useful from the first day, at the cost of amending match-score AC-11 (wording in SAD §4).
>
> — `adr/0003, Decision outcome, verbatim` · full text: [0003-offer-best-match-first-without-a-profile-and-treat-unreadable-scores-as-unscored.md](../adr/0003-offer-best-match-first-without-a-profile-and-treat-unreadable-scores-as-unscored.md)

> | Phone layout | the reason line and the switch are usable at 360 px with no horizontal scrolling; the switch is at least 44×44 px | browser check at 360 px (manual at ship); design-system touch rule |
>
> — `spec.md §6, NFR Phone layout, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `POST /api/v1/realness/settings` `{ on }` → `200 { realness_on }` · `503 REALNESS_SETTINGS_UNAVAILABLE` (show its `message`), `400/403/415/500` → same banner.
- Then rerun `runSearch` (as switching the order does); `SearchResult.realness_on` drives the switch state.

— `contracts/openapi.yaml, operationId setRealnessOn, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-05 — happy

> **Given** realness is on, the owner's list is in best match first, and 12 postings have no match score (pending, cap reached, could not be scored, or no profile yet): 8 with no signal and 4 with signals
> **When** the owner opens the list
> **Then** the postings without a score still come before every scored posting (match-score AC-11), and within that block the 8 come first, newest first, then the 4 from the smallest penalty to the largest, equal penalties newest first; this holds when no profile exists and when scoring has a problem
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — happy

> **Given** realness is on
> **When** the owner switches it off
> **Then** best match first orders by match score alone (match-score AC-11), no card in either order shows a "Lowered" or a "Signals" line, and the choice is kept for the next opening; switching it on again restores the penalty and the reason lines at once; realness is on when the owner first opens the list after this ships
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — error

> **Given** the owner switches realness off or on
> **When** job-radar cannot save the choice
> **Then** the switch returns to its previous state, the list keeps its previous order, and the owner sees that the choice was not saved and can try again
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `setRealnessOn(on)` client — `apps/web/src/api/realness.ts`; mutation that on success invalidates/reruns the search query — `features/realness/queries.ts`
- [ ] `RealnessSwitch` reusing MarkedToggle's markup (`features/tracking/MarkedToggle.tsx`) and `components/InlineBanner.tsx`; disabled while saving or `list.isFetching`; on error revert + banner + Retry — `features/realness/RealnessSwitch.tsx`
- [ ] Place it after OrderSwitch, before MarkedToggle; hide in the marked view; show OrderSwitch without a profile — `routes/Home.tsx`
- [ ] Add the no-profile best-match sentence — `features/matching/ScoringNotice.tsx`
- [ ] Tests: `RealnessSwitch.test.tsx`, `routes/Home.realness.test.tsx` (mock api, as `Home.scores.test.tsx` does)
- [ ] Register RealnessSwitch and the changed OrderSwitch / ScoringNotice — `docs/design-system.md`

## Edge cases

| Case | Behaviour |
|---|---|
| Save fails (503 or network) | switch reverts, banner with API message, Retry repeats the same change, list unchanged |
| Save succeeds, rerun pending | switch disabled, previous list stays visible |
| First open after ship | switch on (`realness_on: true`) |
| No profile | OrderSwitch shown; ScoringNotice sentence only when `order` is `best_match` |
| Marked view on | switch hidden |

## Definition of Done

- [ ] component and route tests pass for every switch state listed above
- [ ] switch label is ≥ 44×44 px (class asserted) and the row wraps at 360 px
- [ ] RealnessSwitch registered in `docs/design-system.md`
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
