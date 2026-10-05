---
id: T14
title: "Add show more, the waiting notice with Refresh, the expired-list reload; register new components"
layer: "ui"
deps: ["T13"]
blocks: []
acs: ["AC-15", "AC-16"]
files_hint: ["apps/web/src/routes/Home.tsx", "apps/web/src/routes/Home.test.tsx", "apps/web/src/features/search/SearchList.tsx", "apps/web/src/components/InlineBanner.tsx", "apps/web/src/components/components.test.tsx", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 40
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T14 — Add show more, the waiting notice with Refresh, the expired-list reload; register new components

## Place in the sequence

- **Blocked by:** T13 — Compose SCR-01 · **Blocks:** — · **Wave:** 3.
- **Lane:** shares `routes/Home.tsx`, `SearchList.tsx` with T13 — serialized (after T13).

## Why (user story)

> **As an** owner
> **I want** results 50 at a time with the total shown, and more on request, without repeats or gaps while collection runs
> **So that** a long list stays fast on my phone and I can trust I have seen all of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

The stable-list behaviour on screen: append pages, announce waiting postings, never change the list by itself.

## Inlined context

| State | Trigger / condition | Components |
|---|---|---|
| show more: pending | `getNextPage` in flight (AC-15) | Button "Show 50 more" (pending) |
| show more: error | `getNextPage` 503 / 500 (AC-12, flow 5). The banner sits under the list, the postings already shown stay, and Retry sends the same cursor | InlineBanner (error, Retry) |
| show more: done | `has_next: false`. The button is gone | — |
| list expired | `getNextPage` 410 `SEARCH_SNAPSHOT_EXPIRED` (ADR-0003). The web re-runs `runSearch`, the list reloads from the newest, and "This list had expired and was reloaded from the newest." shows above it | InlineBanner (info) |
| waiting | `getWaitingCount` 200 with `waiting_count > 0` (AC-16, flow 2). "4 new postings are waiting." with a Refresh action. Refresh = `runSearch` with the field's skills and clears the notice. Poll errors (410 / 503 / 500) show nothing (contract) | InlineBanner (info, action "Refresh"; extended) |

> InlineBanner — An optional `action: { label, onClick }` next to `onRetry` (the action label is currently fixed to "Retry") — The waiting notice needs a "Refresh" action (AC-16)
>
> SkillsField / PostingCard — Registered in design-system: pending · `implement` updates the inventory rows.
>
> — `screens.md §SCR-01 states + New components + Extended primitives, abridged` · full text: [screens.md](../screens.md) (wireframe 01-e)

> Note over S: same path as flow 3, a refresh never starts a new visit
>
> — `sad.md §6, flow 5, verbatim`

**Fallback:** [screens.md](../screens.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml). Do not guess.

## Data delta

No DB changes.

## API contract

`getNextPage(snapshot_id, { cursor: next_cursor })` → `PostingPage`, `410 SEARCH_SNAPSHOT_EXPIRED`, `503`; `getWaitingCount(snapshot_id)` → `{ waiting_count }` (errors silent); Refresh = `runSearch` (never `openVisit`). — `contracts/openapi.yaml, getNextPage + getWaitingCount, abridged`

## Acceptance criteria

### AC-15 — happy

> **Given** a search finds 130 postings
> **When** the list is shown and the owner asks for more twice
> **Then** they first see the newest 50 with "130 postings", then 100, then all 130, in the same order as one long list would have
>
> — `spec.md §5, AC-15, verbatim`

### AC-16 — domain invariant

> **Given** the owner has 50 postings on screen and a collection run adds, merges, reopens or closes postings
> **When** the owner asks for more
> **Then** no posting already on screen appears again and none that belonged after the last one shown is skipped; postings collected after the list was loaded are not inserted into it — the owner is told how many new postings are waiting and can refresh the list; a posting the collector closes while it is on screen stays on screen until the list is refreshed
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `components/InlineBanner.tsx`: optional `action: { label, onClick }` (additive) + test in `components.test.tsx`.
- [ ] `SearchList.tsx`: "Show 50 more" (`fetchNextPage`), pending, error banner with same-cursor Retry, hidden when `!has_next`.
- [ ] `Home.tsx`: waiting notice (poll from T11) with Refresh → `runSearch`; 410 → re-run search + info banner.
- [ ] `docs/design-system.md`: register SkillsField, PostingCard, Badge `new`, InlineBanner `action`.
- [ ] `Home.test.tsx`: 130-posting paging from contract-shaped mocks; waiting notice; expired reload; poll error shows nothing.

## Edge cases

| Case | Behaviour |
|---|---|
| Poll returns 0 | no notice |
| Poll 410/503 | nothing shown, list unchanged |
| Show-more 410 | list reloaded from newest + info banner |
| Refresh | notice cleared, no new visit, new marks unchanged (new marks shown by T13) |

## Definition of Done

- [ ] component tests for every inlined state (show more, list expired, waiting) pass
- [ ] shown pages are never refetched (test asserts no request for earlier cursors)
- [ ] design-system inventory rows added
- [ ] lint + vet clean
