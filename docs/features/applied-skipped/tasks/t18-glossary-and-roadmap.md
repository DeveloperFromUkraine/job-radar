---
id: T18
title: "Add the marked view and grace day to CONTEXT.md and update the roadmap's wave-4 row"
layer: "docs"
deps: []
blocks: []
acs: ["AC-05", "AC-07"]
files_hint: ["CONTEXT.md", "docs/roadmap.md"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T18 — Add the marked view and grace day to CONTEXT.md and update the roadmap's wave-4 row

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** 1 (no deps, starts at once).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to see the postings I marked, including closed ones, and change or clear a mark
> **So that** I can find a role I applied to when a recruiter replies, and fix a decision I regret
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Keeps the two new domain terms and the wave-4 overlap visible to the parallel features.

## Inlined context

> Marked postings (marked view): The view behind the "Show marked postings" switch: only marked postings, closed ones included, plus cleared closed postings not yet removed, most recently marked first (AC-05). *Not yet in CONTEXT — glossary follow-up.*
> Grace day: After a posting loses its applied mark, it stays protected from clean-up until the end of the next calendar day, so the owner can mark it applied again (AC-07). *Not yet in CONTEXT — glossary follow-up.*
>
> — `sad.md §12, Glossary, verbatim` · full text: [sad.md](../sad.md)

> Wave 4 runs steps 4, 5 and 10 in parallel. The roadmap lists `tracking/` as disjoint, but this feature also edits `search/app/` (paging, counts) and `collector/app/` (exports, port name). Steps 4 and 5 will likely change the same list — Mitigation: Land this feature's `search/app/` change in one PR before steps 4/5 touch paging; update the roadmap's wave 4 row
>
> — `sad.md §11, risk 5, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-05 — happy

> **Given** the owner has marked postings, some of which have since closed, and has cleared the marks of some closed postings (AC-07)
> **When** the owner turns on "Show marked postings"
> **Then** the list shows only marked postings, most recently marked first, each with its mark and the date it was set, and with the number of marked postings. Closed postings whose mark the owner cleared and that clean-up has not yet removed are shown too, labelled "Cleared, removed after <date>" with the applied and skipped actions, and counted separately ("and N cleared"). The owner's skills narrow the view as they narrow the main list. A closed posting is labelled "Closed" and names every source, with links only for listings still open. The order and the pages are fixed when the view loads, as for the main list (AC-12): a card whose mark the owner changes stays in place until the view is refreshed, and later pages never repeat or skip a posting. The switch starts off on every visit, and turning it off returns to the unmarked list.
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a posting marked applied that clean-up would remove if it were not applied (it is past the collector's 60-day rule, AC-09)
> **When** the owner clears its mark or changes it to skipped
> **Then** before the change, the owner is told that without the applied mark the posting will be removed at clean-up. Once changed, it is kept until the end of the next calendar day (its grace day), and the owner can mark it applied again until then. Every closed posting whose mark the owner cleared, whatever its age, stays in the marked postings labelled "Cleared, removed after <the date clean-up will remove it>" until it is removed, and the owner can mark it again there. If a source offers the posting again, it is no longer due for removal and keeps its place by the normal rules.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `CONTEXT.md`: two glossary lines in the existing one-line style, each with a NOT-reference (marked view NOT the main list; grace day NOT the 60-day retention)
- [ ] `docs/roadmap.md`: wave 4 row — step 6 also touches `search/app/` and `collector/app/`

## Edge cases

| Case | Behaviour |
|---|---|
| A term already defined differently | Stop and reconcile with `/sdd:glossary`, do not overwrite |

## Definition of Done

**Done when:** CONTEXT.md glossary defines 'Marked postings (marked view)' and 'Grace day' with a NOT-reference each; roadmap wave 4 notes that step 6 also edits search/app/ and collector/app/.

- [ ] both docs updated; `grep -n 'Grace day' CONTEXT.md` finds the entry
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
