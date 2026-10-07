---
id: T13
title: "Add the web tracking client, the MarkActions component and PostingCard's look-alike line, marked variant and actions slot"
layer: "ui"
deps: []
blocks: ["T14"]
acs: ["AC-02", "AC-10", "AC-11"]
files_hint: ["apps/web/src/api/tracking.ts", "apps/web/src/api/search.ts", "apps/web/src/test/contract.ts", "apps/web/src/features/tracking/MarkActions.tsx", "apps/web/src/features/tracking/MarkActions.test.tsx", "apps/web/src/features/search/PostingCard.tsx", "apps/web/src/features/search/PostingCard.test.tsx", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T13 — Add the web tracking client, the MarkActions component and PostingCard's look-alike line, marked variant and actions slot

## Place in the sequence

- **Blocked by:** — · **Blocks:** T14 — Wire marking and the 8-second Undo notice into the main list · **Wave:** 1 (no deps, starts at once).
- **Lane:** shares files with T15, T16 — serialized with them.

## Why (user story)

> **As an** owner
> **I want** a posting that looks like one I already marked to say so
> **So that** I don't apply twice to the same role
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

The building blocks every screen state uses: the typed calls, the two mark buttons and the card parts.

## Inlined context

> NEW: MarkActions — unmarked: Two Buttons, "Applied" and "Skipped", side by side in a two-column grid with `gap-2` (8 px), each at least 44 px tall, at the bottom of the card · marked: The other mark plus "Clear" · pending: The pressed Button is pending and the other is disabled · confirm: Warning text in `text-text` with a `border-danger` frame like InlineBanner `warning`, then "Continue" and "Cancel" in the same two-column grid. Each action's accessible name includes the posting title ("Mark Senior Backend Engineer applied").
>
> — `screens.md §SCR-01, NEW: MarkActions, abridged` · full text: [screens.md](../screens.md)

> Extended PostingCard — Look-alike line: Main list only, when `look_alike` is set. `text-sm text-text-muted`, plain text: "You applied to a similar posting at <company> on <d Mon>" / "You skipped …" · Marked variant: no New badge; the title row carries the mark Badge and, when closed, "Closed"; the mark line reads "Applied on 3 Oct" / "Skipped on 1 Oct" / "Cleared · removed after 8 Oct" / "Not marked" · Actions slot: MarkActions at the bottom of the card, full card width on phones. Badge: Applied uses tone `notice`; Skipped, Closed and Cleared use `disabled`.
>
> — `screens.md §SCR-01, Extended: PostingCard + reused primitives, abridged` · full text: [screens.md](../screens.md)

> **Code fact:** `apps/web/src/test/contract.ts` loads the collector and search-postings contracts and returns the **first** operation id match. The applied-skipped contract restates `runSearch`, `getNextPage`, `getWaitingCount`, so add it **first** in `docs`, or the old search examples win.
>
> — `apps/web/src/test/contract.ts:1-14, abridged`

> Reuse: Button, InlineBanner, Badge, PostingCard. New: MarkActions (registered in `docs/design-system.md` as pending → add the inventory row).
>
> — `screens.md §New components, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** Semantic tokens only, mobile-first from 360 px. The applied and skipped actions are each at least 44×44 px and at least 8 px apart. Titles and companies in the hint are rendered as React text only, the same as search AC-09.
>
> — `sad.md §8, UI styling + Untrusted source content, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Client functions for `setMark`, `undoMark`, `runMarkedView`, `getNextMarkedPage`; `runSearch` result gains `marked_count`; `Posting` gains `look_alike`. Error codes the client surfaces: `TRACKING_POSTING_NOT_FOUND` (404), `TRACKING_MARK_CHANGED_ELSEWHERE` (409), `TRACKING_MARKS_UNAVAILABLE` (503).

`MarkState` = `{ posting_id, mark: applied|skipped|null, marked_at: date-time|null, change_id: uuid|null, at_risk: boolean, removed_after: date|null }` — `at_risk`: past the collector's 60-day rule; `removed_after`: for a cleared closed posting, the later of the grace-day end and the retention date, else null.

— `contracts/openapi.yaml, components.schemas.MarkState, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-02 — happy

> **Given** an open posting from a company with other open postings is in the owner's list
> **When** the owner marks it skipped
> **Then** it leaves the list exactly as an applied posting does (AC-01), with the notice "Marked skipped" and Undo, and the company's other postings stay in the list
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — happy

> **Given** the owner marked a posting at "Acme Inc" titled "Sr. Backend Engineer (Go) – Remote" applied on 3 October, and 8 days after its latest publication time the collector adds a separate open posting from "ACME" titled "Senior Backend Engineer"
> **When** the new posting is shown in the owner's list
> **Then** it carries the hint "You applied to a similar posting at Acme on 3 Oct", and the hint names the earlier mark (applied or skipped) and the date it was set. Two postings are similar when their company and title match the way the collector matches them when merging (collector AC-04 note: letter case, punctuation, generic "remote" wording and legal suffixes ignored) and, beyond that, any bracketed part of the title other than a region name is ignored and "Sr" is read as "Senior" and "Jr" as "Junior". Publication times and location restrictions are not compared. When several marked postings match, the hint names an applied one if there is one, otherwise the most recently set skipped mark. Any marked posting job-radar still holds can be the match, closed ones included; a posting whose mark was cleared is unmarked and gives no hint.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — domain invariant

> **Given** a look-alike posting carries a hint about a marked one
> **When** the owner's list is built
> **Then** the look-alike is never hidden and never inherits the mark; it stays in the list and counts until the owner marks it; and a posting from the same company with a different title carries no hint
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `apps/web/src/test/contract.ts`: add the applied-skipped contract first
- [ ] `apps/web/src/api/tracking.ts`: `setMark`, `undoMark`; `apps/web/src/api/search.ts`: new fields + `runMarkedView`, `getNextMarkedPage`
- [ ] `features/tracking/MarkActions.tsx` (+ test): the four states, composing Button
- [ ] `features/search/PostingCard.tsx` (+ test): look-alike line, marked variant, actions slot (additive props, existing call sites unchanged)
- [ ] `docs/design-system.md`: add the MarkActions inventory row and the PostingCard extension

## Edge cases

| Case | Behaviour |
|---|---|
| Title or company with `<script>` | Rendered as text |
| Look-alike on a card in the marked view | Not shown (main list only) |
| Long title at 360 px | Wraps; no horizontal scroll |
| Same company, different title | No look-alike line (server sends `look_alike: null`) |

## Definition of Done

**Done when:** MarkActions.test.tsx covers unmarked / marked / pending / confirm states and accessible names; PostingCard.test.tsx renders the look-alike line as text from the runSearch found_with_hint example and the marked variant from the runMarkedView example; the api clients' types match the applied-skipped contract examples.

- [ ] `MarkActions.test.tsx` and `PostingCard.test.tsx` pass
- [ ] buttons measured ≥ 44 px tall with an 8 px gap in the test
- [ ] design-system inventory updated
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
