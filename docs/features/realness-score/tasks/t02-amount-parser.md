---
id: T02
title: "Write the amount parser and its labelled salary set"
layer: "domain"
deps: []
blocks: ["T05", "T08"]
acs: ["AC-06"]
files_hint: ["apps/server/src/modules/realness/domain/pay.ts", "apps/server/src/modules/realness/domain/pay.test.ts", "apps/server/src/modules/realness/domain/pay-fixtures.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T02 — Write the amount parser and its labelled salary set

## Place in the sequence

- **Blocked by:** nothing — can start at once · **Blocks:** T05 — Keep each board's pay field on every fetch and the reopening time in the collector, T08 — Implement assess(): work out penalty and signals for a set of postings with switch-on rules · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** owner
> **I want** each lowered posting to name every signal behind its penalty
> **So that** I can check the reason on the board and decide for myself
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

A wrong "no salary" is the reason most likely to make the owner stop trusting every reason; this task makes the one rule that decides it, and proves it on real postings.

## Inlined context

> **Chosen:** option 1. One parser judges every amount, so "competitive" in Remotive's field and "$5M Series A" in a description fall under the same rule and the same fixture set. A rule fix needs no recollection, and the collector keeps statements as stated, as it already does for location.
>
> — `adr/0004, Decision outcome, verbatim` · full text: [0004-keep-each-boards-pay-field-as-text-on-the-listing-and-judge-it-in-realness.md](../adr/0004-keep-each-boards-pay-field-as-text-on-the-listing-and-judge-it-in-realness.md)

> | Salary rule accuracy | ≥ 95% of a fixed set of at least 100 real postings get the right "no salary" decision, at least 20 of them stating pay only in the board's own field and at least 20 with non-pay amounts | a fixture set labelled by hand, checked in the unit tests |
>
> — `spec.md §6, NFR Salary rule accuracy, verbatim` · full text: [spec.md](../spec.md)

> - Himalayas: `minSalary`/`maxSalary` with `salaryPeriod`.
> - Remotive: the free-text `salary` field, often empty, sometimes like "$50-$75 /hour".
> - Jobicy: `salaryMin`/`salaryMax` with `salaryCurrency` [...]
> - We Work Remotely: no pay field.
>
> — `sad.md §4, Resolves spec §8 Q1, abridged` · full text: [sad.md](../sad.md)

> The amount parser is a hand-written pattern set, with no currency or locale library. It is good enough for the ≥ 95% target on the fixture set, and gets widened when the §7 check finds misses.
>
> — `sad.md §11, Accepted debt, verbatim` · full text: [sad.md](../sad.md)

> A posting's text claims a salary it doesn't mean ("salary: $1") to avoid the "no salary" signal: it can only avoid a lowering, never raise a posting above its honest match score.
>
> — `spec.md §6.1, Abuse cases, verbatim` · full text: [spec.md](../spec.md)

> Assumed: property tests are generated in a seeded loop in Vitest, with no new dependency. The salary fixture set sits beside the parser in `realness/domain/`.
>
> — `sad.md §4, Assumptions ledger, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 — domain invariant

> **Given** a posting states its pay — any of its open listings from an enabled source has an amount in its board's own pay field, or the title or description of any of those listings gives an amount of money as pay, such as "$120k", "120–150K USD", "PLN 20 000–25 000 net B2B", "18 000 zł/mies.", "€60,000 a year" or "30k/month"
> **When** job-radar works out its realness signals
> **Then** the posting has no "no salary" signal; wording without an amount ("competitive", "DOE", "attractive package", "market rate") counts as no stated salary, and amounts that are not pay ("$5M Series A", "$2,000 learning budget", "$1B ARR") are never read as a salary; a listing whose pay state is unknown (collected before this shipped and not fetched since, §1) on a board that has a pay field counts as stating pay until its next fetch
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Export one pure `statesPay(text: string): boolean` — true when the text holds an amount of money as pay — `apps/server/src/modules/realness/domain/pay.ts`. No I/O, no new dependency
- [ ] Cover: currency symbols and codes before/after (`$`, `€`, `£`, `USD`, `PLN`, `zł`), `k`/`K`, ranges with `-`/`–`, thousands with `,`/space/`.`, periods (`/hour`, `/month`, `a year`, `/mies.`), "net B2B"
- [ ] Reject wording without an amount ("competitive", "DOE", "attractive package", "market rate") and non-pay amounts (funding, budgets, ARR, valuations) by context words around the amount
- [ ] Build the labelled set (≥ 100 public postings, ≥ 20 board-field-only pay strings in the form T05 writes, ≥ 20 with non-pay amounts) — `apps/server/src/modules/realness/domain/pay-fixtures.ts`; no personal data
- [ ] Test every AC-06 example individually, then assert the ≥ 95% rate over the set and print the misses — `pay.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `""` (board states nothing) | `false` |
| "salary: $1" | `true` — accepted; it can only avoid a lowering (spec §6.1) |
| "$5M Series A", "$2,000 learning budget", "$1B ARR" | `false` |
| "competitive", "DOE", "market rate" | `false` |
| "18 000 zł/mies.", "PLN 20 000–25 000 net B2B", "30k/month" | `true` |
| Remotive "$50-$75 /hour" | `true` |

## Definition of Done

- [ ] every AC-06 example has its own passing assertion
- [ ] ≥ 95% of the labelled set (≥ 100, ≥ 20 field-only, ≥ 20 non-pay) is decided right
- [ ] `pay.ts` imports nothing outside the module and makes no I/O
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
