---
id: T04
title: "Let search's bestMatchOrder take a realness penalty"
layer: "domain"
deps: []
blocks: ["T10"]
acs: ["AC-01", "AC-05"]
files_hint: ["apps/server/src/modules/search/domain/order.ts", "apps/server/src/modules/search/domain/order.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T04 — Let search's bestMatchOrder take a realness penalty

## Place in the sequence

- **Blocked by:** nothing — can start at once · **Blocks:** T10 — Assess at snapshot build, order by penalty, and present realness and realness_on in search · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** owner
> **I want** postings without a match score to be lowered by their signals too
> **So that** the feature works before I set up a profile, without a key, or after the scoring cap is reached
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task is the one place the penalty changes order: score minus penalty for scored postings, and penalty-ascending within the unscored block.

## Inlined context

> *match-score AC-11*, amended: "Best match first can be chosen with or without a profile. In it, postings with no match score — pending, cap reached, could not be scored, no profile yet, or scores that cannot be read — come first, and then scored postings follow from the highest to the lowest score minus the realness penalty. Within the unscored block, postings with no realness penalty come first, then the rest from the smallest penalty to the largest. Equal values keep newest first. With realness off, the penalty is 0." (ADR-0003)
>
> — `sad.md §4, Upstream amendments, verbatim` · full text: [sad.md](../sad.md)

> ```ts
> export function bestMatchOrder(ids: readonly string[], scoreOf: (id: string) => number | null): string[] {
>   const unscored = ids.filter((id) => scoreOf(id) === null);
>   const scored = ids.filter((id) => scoreOf(id) !== null);
>   // Array.prototype.sort is stable, so equal scores stay newest first.
>   scored.sort((a, b) => (scoreOf(b) as number) - (scoreOf(a) as number));
>   return [...unscored, ...scored];
> }
> ```
>
> — `apps/server/src/modules/search/domain/order.ts, bestMatchOrder, verbatim (code at breakdown time)` · full text: [order.ts](../../../../apps/server/src/modules/search/domain/order.ts)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy

> **Given** realness is on, the owner's list is in best match first, and it holds posting A with match score 88 and no signals, posting B with match score 92, posted 65 days ago and stating no salary, and posting C with match score 70 and no signals
> **When** the owner opens the list
> **Then** they see A (88), then C (70), then B (92 minus 25 is 67); each card still shows its own match score, A 88, C 70 and B 92; postings with an equal score after the penalty keep their newest-first order
>
> > Penalty points: posted or first found 30–59 days ago 10; 60 or more days ago 20; open at three or more enabled sources and first found 45 or more days ago 15 (the larger of this and age counts, not both); reposted 10; no stated salary 5. The total is capped at 30. "N days ago" counts calendar days in the owner's time zone between the time and today, for both the thresholds and the number on the card.
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — happy

> **Given** realness is on, the owner's list is in best match first, and 12 postings have no match score (pending, cap reached, could not be scored, or no profile yet): 8 with no signal and 4 with signals
> **When** the owner opens the list
> **Then** the postings without a score still come before every scored posting (match-score AC-11), and within that block the 8 come first, newest first, then the 4 from the smallest penalty to the largest, equal penalties newest first; this holds when no profile exists and when scoring has a problem
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add an **optional** third parameter `penaltyOf?: (id: string) => number` (default 0) so the current caller in `search/app/search.ts` still compiles — `apps/server/src/modules/search/domain/order.ts`
- [ ] Scored: stable sort by `score − penalty` descending. Unscored: stable sort by penalty ascending (penalty 0 first). Unscored block still first
- [ ] Update the header comment to cite the amended match-score AC-11
- [ ] Add tests for AC-01's and AC-05's examples and for penalty omitted = today's order — `order.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `penaltyOf` omitted (realness off) | exactly today's best-match order |
| Two scored postings with equal `score − penalty` | newest first (stable sort over newest-first input) |
| Every posting unscored (no profile / unreadable scores) | whole list ordered by penalty ascending, ties newest first |
| Score 20, penalty 30 | sorts at −10; the shown score is untouched (search's job) |

## Definition of Done

- [ ] AC-01 and AC-05 examples asserted in `order.test.ts`
- [ ] existing `order.test.ts` cases pass unchanged
- [ ] `pnpm -r build` (tsc) still compiles `search/app/search.ts` without edits
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
