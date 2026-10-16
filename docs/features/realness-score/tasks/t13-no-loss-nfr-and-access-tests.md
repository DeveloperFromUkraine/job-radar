---
id: T13
title: "Prove no loss, unchanged speed, zero cost and refused outsiders end to end"
layer: "tests"
deps: ["T10"]
blocks: []
acs: ["AC-03", "AC-04", "AC-12", "AC-13"]
files_hint: ["apps/server/test/realness-e2e.integration.test.ts", "apps/server/test/realness-nfr.integration.test.ts", "apps/server/test/helpers/search-fixtures.ts", "apps/server/test/access.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T13 — Prove no loss, unchanged speed, zero cost and refused outsiders end to end

## Place in the sequence

- **Blocked by:** T10 — Assess at snapshot build, order by penalty, and present realness and realness_on in search · **Blocks:** nothing · **Wave:** 6.
- **Lane:** shares `apps/server/test/helpers/search-fixtures.ts` with T06 — serialized.

## Why (user story)

> **As a** owner
> **I want** the newest-first order, the counts and the shown match score to stay exactly as they are
> **So that** I never miss a fresh posting because of a signal
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task proves the promise that realness never costs the owner a posting, a count, the newest-first order or their match score.

## Inlined context

> | Search response with realness | ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings, scores and realness on, in either order — unchanged from search | the search integration test, rerun with realness on and best match first |
> | No hiding | 0 postings left out of the list or its counts because of realness | property test: the list with realness on and off holds the same postings and counts |
> | Newest-first unchanged | 0 differences in the newest-first order between realness on and off | property test over generated postings with signals |
> | Cost | 0 provider requests and $0 added to the scoring cap's spend by realness | unit test over what realness calls; scoring health spend unchanged |
>
> — `spec.md §6, NFR rows, verbatim` · full text: [spec.md](../spec.md)

> **How verify:** property tests over generated postings with signals, in a seeded loop: build the list with realness on and off and compare postings, total, hidden and marked counts, the newest-first id sequence and every card's match; assert `penalty ≤ 30`.
>
> — `sad.md §10, QG-1, verbatim` · full text: [sad.md](../sad.md)

> **How verify:** the search integration test, rerun with realness on and best match first (and newest first); a unit test asserting realness reaches no provider client, and scoring health spend unchanged across a realness-on run.
>
> — `sad.md §10, QG-3, verbatim` · full text: [sad.md](../sad.md)

> | Access | Loopback only, same-origin, JSON body on every state-changing request; applies unchanged to the realness switch (AC-12) | `core/access.ts`, collector ADR-0007 |
>
> — `sad.md §8, Access row, verbatim` · full text: [sad.md](../sad.md)

> If the salary-text check pushes p95 past search's target, memoise the per-listing pay decision by listing id and text length + hash in process (§11).
>
> — `sad.md §7, Scaling thresholds, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Exercises `runSearch`, `getNextPage`, `getRealnessSettings`, `setRealnessOn`; every operation answers `403 Forbidden` for a non-loopback Host or a cross-site request.

— `contracts/openapi.yaml, all four operations, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-03 — domain invariant

> **Given** realness is on and some postings in the owner's list carry realness signals
> **When** the owner looks at the list in either order, with or without a profile, and with the remote filter on or off
> **Then** the list holds exactly the postings it would hold with realness off, every count (the list total, the hidden count, the marked count) is the same, every card shows the same match score and fit note as with realness off, and no posting's penalty is above 30 points
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** realness is on and the owner's list is newest first
> **When** the owner opens the list or asks for more
> **Then** the postings are in exactly the newest-first order search gives them, with or without signals; postings with signals show them as "Signals: …", never as "Lowered" (AC-02)
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — authorization

> **Given** a visitor can reach the owner's machine over the network, or the owner opens a web page from another site in the same browser
> **When** the visitor or that page tries to switch realness off or on, or to read the list with its reasons
> **Then** it cannot — as with search (search AC-17) the whole app is reachable only on the owner's own machine, and as with marks (applied-skipped AC-16) another site cannot act on the owner's behalf
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — cross-context

> **Given** realness is on
> **When** the remote filter decides a posting's location verdict, the owner marks a posting applied or skipped, or job-radar works out a match score
> **Then** none of them changes because of realness: the remote filter hides exactly the same postings, marks move postings out of the list as before, the "new" mark shows as before, the match score and its terms part are worked out from the posting and profile alone, and realness asks the language-model provider for nothing and adds nothing to the scoring cap's spend
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Extend the posting builder with `payField`, `reopenedAt` and closed look-alike postings — `apps/server/test/helpers/search-fixtures.ts`
- [ ] Seeded loop (no new dependency): random postings with signals, both orders, profile on/off, remote filter on/off; compare on vs off — `realness-e2e.integration.test.ts`
- [ ] Rerun the search NFR shape with 10,000 open postings, scores and realness on, both orders; if p95 > 1 s, add the memo from sad §7 and re-measure — `realness-nfr.integration.test.ts`
- [ ] Fake provider (`helpers/fake-provider.ts`): 0 requests from realness, scoring spend unchanged
- [ ] Add the realness routes to the loopback/cross-site cases — `apps/server/test/access.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Remote filter on vs off, profile vs none | on/off comparison holds in each combination |
| Every generated posting at the cap | penalty exactly 30, never above |
| Paging through the whole snapshot | same id sequence as with realness off in newest first |
| p95 over budget | memo added, then measured again; never a skipped assertion |

## Definition of Done

- [ ] property test, NFR test and access cases pass
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
