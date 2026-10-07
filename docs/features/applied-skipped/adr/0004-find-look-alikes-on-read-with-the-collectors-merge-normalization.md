---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-10-07"
feature_size: "S"
ticket: ""
---

# 0004 — Find look-alikes on read with the collector's merge normalization

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

A re-post the collector did not merge comes back as a separate, unmarked posting. AC-10 shows it with a hint naming the earlier mark and its date when its company and title match a marked posting's: the collector's merge normalization (letter case, punctuation, generic "remote" wording, legal suffixes), plus bracketed parts other than region names ignored and "Sr"/"Jr" read as "Senior"/"Junior". When several marked postings match, an applied one wins, else the most recent skip; closed marked postings count, cleared ones do not. The rule may widen after two weeks of real look-alikes (spec §8, due 2026-10-31).

## Decision drivers

- AC-10 / AC-11: the hint follows the current marks and current titles; the look-alike is never hidden.
- Spec §8: the rule is expected to change.
- Spec §6: search ≤ 1 s p95 with 10,000 open and 5,000 marked postings.
- Collector AC-04: one normalization for "same company, same title", owned by the collector.

## Considered options

1. **Compute on read.** For each page, tracking reads the current marked postings' company and title, builds a map from look-alike key to the winning mark, and looks up each unmarked posting on the page. The key is the collector's merge normalization (exported through `collector/app`) followed by tracking's extra title rules in `tracking/domain`.
2. **Store the key on the mark row.** Compute the key when the mark is set, keep it in an indexed column, and look up by index.

## Decision outcome

**Chosen:** Option 1. It always uses the posting's current title and the current rule, so widening the rule after the spec §8 question is a code change with no data migration. Its cost is normalizing the marked postings' titles once per page — a few thousand short strings — which is small against the 1 s budget; if a measured page passes the budget, the map can be kept for the snapshot's lifetime.

## Consequences

**Positive**
- No stored key to go stale when the collector updates a title or the rule changes.
- One normalization source: the collector's merge rule plus a small, unit-tested extension.

**Negative**
- Work per page grows with the number of marked postings.

**Neutral**
- The collector exports its normalizers read-only; its merge rule is unchanged (spec §3 non-goal).
- Switching to a stored key later means a backfill of every mark row.

## Links

- Spec: [[../spec.md]] AC-10, AC-11, §6, §8
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0001-ship-marks-as-new-tracking-module-plus-main-screen-actions]], collector [ADR-0005](../../remote-boards-collector/adr/0005-store-postings-and-listings-separately-and-merge-at-collection-time.md)
