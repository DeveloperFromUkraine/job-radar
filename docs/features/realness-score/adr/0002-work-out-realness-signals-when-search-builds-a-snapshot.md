---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-16"
feature_size: "S"
ticket: "roadmap step 12 — realness-score"
---

# 0002 — Work out realness signals when search builds a snapshot

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** Volodymyr Kozlov, with Claude during the design walk

## Context

Age and the many-boards signal change every day and whenever the owner disables a source, without any collection run, so they must be worked out on read (AC-09: "changes from the next time the list is loaded or refreshed"). The open choice was the salary-text check — looking for an amount of money in each listing's title and description — which could run on every list build over up to 10,000 postings, or once per fetch in the collector with the result stored.

## Decision drivers

- Spec §6 NFR: "≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings, scores and realness on, in either order — unchanged from search".
- Spec §6 NFR: salary rule accuracy ≥ 95% on a labelled set — the rule will be corrected after the §7 hand check (spec §8 Q2).
- AC-09: a change the collector makes shows from the next load or refresh.
- Search already scans every open posting's text on each build to match skills.

## Considered options

1. **Everything at snapshot build** — the collector stores raw facts only; realness works out all four signals, the text check included, when search builds a snapshot, for every shown posting in either order; the result is kept in the snapshot.
2. **Text check once per fetch** — the collector parses the text on each fetch and stores a "pay in text" flag; the build reads the flag.

## Decision outcome

**Chosen:** option 1. A corrected amount rule applies at the next load with no backfill and no rule-version recompute, listings collected before shipping are judged from their text at once, and search already pays a similar per-build text scan for skills. Penalties and signals are fixed in the snapshot, so paging never reshuffles.

## Consequences

**Positive**
- One place for the rules; no derived column to keep in step with the rule.
- Signals are always current with enabled sources, age and the collector's latest data.

**Negative**
- Each build costs a text scan; the risk is tracked in SAD §11 and caught by the search NFR integration test.

**Neutral**
- If the scan proves too slow, an in-process memo keyed by listing id and text hash is a local change inside realness; moving to option 2 later needs one column and a backfill.

## Links

- Spec: [[../spec.md]] AC-06, AC-07, AC-08, AC-09, §6
- SAD: [[../sad.md]] §4, §7, §11
- Related ADR: [[0004-keep-each-boards-pay-field-as-text-on-the-listing-and-judge-it-in-realness]]
