---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-16"
feature_size: "S"
ticket: "roadmap step 12 — realness-score"
---

# 0004 — Keep each board's pay field as text on the listing and judge it in realness

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** Volodymyr Kozlov, with Claude during the design walk (assumptions ledger, accepted as a batch)

## Context

AC-06 says a posting states pay when any open listing's board pay field, or its title or description, gives an amount of money as pay. Wording such as "competitive" does not count. A listing collected before this ships has an unknown pay state, which counts as stating pay on a board that has a pay field. Boards differ: Himalayas has numeric `minSalary`/`maxSalary`, Remotive a free-text `salary` that may say "competitive", Jobicy optional annual amounts, and We Work Remotely nothing. `RawListing` and `collector_listings` keep no pay data today.

## Decision drivers

- AC-06 and the salary NFR: ≥ 95% right, with at least 20 postings stating pay only in the board's field and at least 20 with non-pay amounts.
- Spec §1: the pay state is written on every fetch, even when nothing else changed.
- The spec §6.1 abuse case: a planted "salary: $1" may avoid a lowering but never raise a posting.
- Collector keeps facts as stated (as it does for `locationRestriction`); interpretation lives with the feature that needs it.

## Considered options

1. **Pay field as text, judged by realness** — `RawListing.payField` and `collector_listings.pay_field`: the board's own pay statement as text (`""` when the board states nothing or has no field, NULL until first fetch after shipping); the collector exports `hasPayField` per source; realness's one amount parser judges both the field and the text.
2. **A yes/no "board stated pay" flag set by each adapter** — each adapter decides; Remotive's free text would need its own amount check in the collector, separate from the text rule in realness.

## Decision outcome

**Chosen:** option 1. One parser judges every amount, so "competitive" in Remotive's field and "$5M Series A" in a description fall under the same rule and the same fixture set. A rule fix needs no recollection, and the collector keeps statements as stated, as it already does for location.

## Consequences

**Positive**
- One rule, one fixture set; correcting the parser needs no migration.
- Unknown (NULL) is distinct from "board says nothing" (`""`), as AC-06 needs.

**Negative**
- A text column per listing instead of a flag (a few bytes per listing).
- Jobicy's field names come from its API documentation and are checked against a live payload in `implement` (SAD §11).

**Neutral**
- A pay-field change alone does not make a posting an "Updated posting"; source-health counts do not move.

## Links

- Spec: [[../spec.md]] AC-06, §1, §6.1, §8 Q1 (resolved in SAD §4)
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-work-out-realness-signals-when-search-builds-a-snapshot]]
