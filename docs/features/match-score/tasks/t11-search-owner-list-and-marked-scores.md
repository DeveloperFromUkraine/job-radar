---
id: T11
title: "Export the owner's list from search and show the last score in the marked view"
layer: "app"
deps: ["T10"]
blocks: ["T12", "T14"]
acs: ["AC-13"]
files_hint: ["apps/server/src/modules/search/app/owner-list.ts", "apps/server/src/modules/search/app/marked.ts", "apps/server/src/modules/search/app/present.ts", "apps/server/test/search-owner-list.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Export the owner's list from search and show the last score in the marked view

## Place in the sequence

- **Blocked by:** T10 — Give search a ScoreReader, the best-match order and a match on every posting · **Blocks:** T12 — Implement matching's score reader and scoring health, T14 — Run the background scorer: polling, wake-ups, queue order, retry cadence, start and stop · **Wave:** 3.
- **Lane:** shares `apps/server/src/modules/search/app/present.ts` with T10 — serialized.

## Why (user story)

> **As an** owner
> **I want** scoring to stop at a monthly cap I can see
> **So that** job-radar never costs me more than I agreed to
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Gives matching one definition of what to score, and keeps marked postings' last scores visible without ever scoring them again.

## Inlined context

> **Chosen:** Option 1. The list is defined once, in search; matching reads it; search reads scores through an interface wired at the composition root, so no import cycle exists. Scores and the best-match order are taken when the snapshot is built, as remote-filter verdicts are (remote-filter ADR-0002). Option 2 leaves postings collected between visits unscored until the owner opens the screen, breaking the freshness NFR; option 3 duplicates the list rules, which would drift.
>
> — `adr/0004, Decision outcome, verbatim` · full text: [0004-read-scores-into-search-through-an-injected-reader-and-read-the-list-from-search.md](../adr/0004-read-scores-into-search-through-an-injected-reader-and-read-the-list-from-search.md)

> > Scoring follows the list the owner sees, not "postings collected since", so postings brought into the list by a change of skills or filter are scored too, and nothing is spent on postings the owner cannot see. With an empty skills field the list is every open posting the filter shows (search AC-10), and the cap bounds the cost.
>
> — `spec.md §5, AC-13 note, verbatim` · full text: [spec.md](../spec.md)

> > In the marked view a marked posting shows the last score it had, with its mark if stale; marked postings are never scored again.
>
> — `spec.md §5, AC-13 note, verbatim` · full text: [spec.md](../spec.md)

> Switching the order runs a new search in that order. Search keeps the choice beside the last skills, so it is in place at the next opening, and the snapshot comes back as in flow 2. Widening the skills, switching the remote filter off or starting a one-off look builds a new snapshot. The score reader call during that build wakes the scorer, and the postings that newly entered show "pending". The scorer then reads the owner's current list from search, which never holds marked or hidden postings, and scores the new ones in their turn: postings with no score before stale ones, newest first. The marked view reads each marked posting's last score, with its stale mark if it has one. Marked postings are never in the owner's list, so they are never scored again. Because the scorer re-reads the list on every pass, a posting marked or hidden before its turn is never scored.
>
> — `sad.md §6, Flow 8 prose, verbatim` · full text: [sad.md](../sad.md)

> - Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`; a module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, layering, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `runMarkedView` / `getNextMarkedPage`: each `MarkedPosting` gains `match: Match|null` (last score, stale mark if any, never re-scored).
- New in-process export (no HTTP): `ownerListIds()` — unmarked open postings that match the kept skills and are shown by the remote filter, newest first.

— `contracts/openapi.yaml, operationIds runMarkedView / getNextMarkedPage, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-13 — cross-context

> **Given** the owner's list (unmarked open postings that match the typed skills and are shown by the remote filter) holds 30 postings that have no score yet, the remote filter hides 20 more, and 5 are marked
> **When** scoring runs
> **Then** the 30 postings in the list are scored, newest first; the hidden and marked postings are not scored; when the owner widens their skills, switches the filter off or starts a one-off look, the postings that newly enter the list are scored in their turn; a posting marked or hidden before its turn is not scored; postings with no score at all are scored before postings whose score is stale (AC-10)
>
> > In the marked view a marked posting shows the last score it had, with its mark if stale; marked postings are never scored again.
>
> > Scoring follows the list the owner sees, not "postings collected since", so postings brought into the list by a change of skills or filter are scored too, and nothing is spent on postings the owner cannot see. With an empty skills field the list is every open posting the filter shows (search AC-10), and the cap bounds the cost.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/app/owner-list.ts`: `ownerListIds()` from the kept skills, marks and the active filter, newest first, reusing the snapshot's selection code
- [ ] `marked.ts` / `present.ts`: `match` on marked items via the ScoreReader
- [ ] `search-owner-list.integration.test.ts`: AC-13's 30 in the list, 20 hidden, 5 marked

## Edge cases

| Case | Behaviour |
|---|---|
| Posting marked before its turn | absent from `ownerListIds()` |
| Filter switched off | the hidden postings appear in `ownerListIds()` |
| Empty skills | every open posting the filter shows (search AC-10) |
| Marked posting never scored | `match: null` in the marked view |

## Definition of Done

**Done when:** `search-owner-list.integration.test.ts` passes AC-13: exactly the 30 listed postings, newest first, none of the 20 hidden or 5 marked; the marked view returns each marked posting's last score.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
