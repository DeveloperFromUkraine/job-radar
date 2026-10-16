---
id: T14
title: "Write the amended match-score AC-11 and collector AC-11 into their specs"
layer: "docs"
deps: ["T05", "T10"]
blocks: []
acs: ["AC-05", "AC-06"]
files_hint: ["docs/features/match-score/spec.md", "docs/features/remote-boards-collector/spec.md", "CONTEXT.md"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T14 — Write the amended match-score AC-11 and collector AC-11 into their specs

## Place in the sequence

- **Blocked by:** T05 — Keep each board's pay field on every fetch and the reopening time in the collector, T10 — Assess at snapshot build, order by penalty, and present realness and realness_on in search · **Blocks:** nothing · **Wave:** 6.
- **Lane:** own lane.

## Why (user story)

> **As a** owner
> **I want** postings without a match score to be lowered by their signals too
> **So that** the feature works before I set up a profile, without a key, or after the scoring cap is reached
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task keeps the upstream specs true, so a later change to best-match order or the collector does not quietly undo realness.

## Inlined context

> Match-score rule it amends: AC-11 (in best match first, the order uses the score minus the realness penalty, and within the unscored block less-lowered postings come first). Collector rules it amends: a listing also keeps whether its board stated pay, written on every fetch of the listing even when nothing else changed, and a posting keeps when it last reopened (collector AC-11), counted from when this ships. [...] Both upstream specs carry a back-reference to this spec until `design` writes the amended wording.
>
> — `spec.md §1, Traceability, abridged` · full text: [spec.md](../spec.md)

> - *match-score AC-11*, amended: "Best match first can be chosen with or without a profile. In it, postings with no match score — pending, cap reached, could not be scored, no profile yet, or scores that cannot be read — come first, and then scored postings follow from the highest to the lowest score minus the realness penalty. Within the unscored block, postings with no realness penalty come first, then the rest from the smallest penalty to the largest. Equal values keep newest first. With realness off, the penalty is 0." (ADR-0003)
> - *remote-boards-collector AC-11*, amended: "A posting that reopens also keeps when it reopened (the latest reopening). A listing keeps its board's own pay field as stated, written on every fetch of the listing, even when nothing else changed. A change in the pay field alone does not make the posting an updated posting." (ADR-0004)
>
> — `sad.md §4, Upstream amendments, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-05 — happy

> **Given** realness is on, the owner's list is in best match first, and 12 postings have no match score (pending, cap reached, could not be scored, or no profile yet): 8 with no signal and 4 with signals
> **When** the owner opens the list
> **Then** the postings without a score still come before every scored posting (match-score AC-11), and within that block the 8 come first, newest first, then the 4 from the smallest penalty to the largest, equal penalties newest first; this holds when no profile exists and when scoring has a problem
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** a posting states its pay — any of its open listings from an enabled source has an amount in its board's own pay field, or the title or description of any of those listings gives an amount of money as pay, such as "$120k", "120–150K USD", "PLN 20 000–25 000 net B2B", "18 000 zł/mies.", "€60,000 a year" or "30k/month"
> **When** job-radar works out its realness signals
> **Then** the posting has no "no salary" signal; wording without an amount ("competitive", "DOE", "attractive package", "market rate") counts as no stated salary, and amounts that are not pay ("$5M Series A", "$2,000 learning budget", "$1B ARR") are never read as a salary; a listing whose pay state is unknown (collected before this shipped and not fetched since, §1) on a board that has a pay field counts as stating pay until its next fetch
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Replace match-score AC-11's Then with the amended wording, add `(amended by realness-score, ADR-0003)` and remove the interim back-reference — `docs/features/match-score/spec.md`
- [ ] Append the amended sentences to collector AC-11, cite realness-score ADR-0004, remove the interim back-reference — `docs/features/remote-boards-collector/spec.md`
- [ ] Check `CONTEXT.md` has Realness signal, Realness penalty, Reason line, Pay field, Daily lowered share (sad §12 cites them); add any missing via the glossary format

## Edge cases

| Case | Behaviour |
|---|---|
| Upstream wording already edited by someone | merge, keeping the sad §4 sentences verbatim |
| A CONTEXT term exists with a different meaning | stop and raise it — do not overwrite |

## Definition of Done

- [ ] both upstream ACs match sad §4 verbatim
- [ ] no interim back-reference left in either upstream spec
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
