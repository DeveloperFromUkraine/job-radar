---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "roadmap step 2 — remote-boards-collector"
---

# 0006 — Keep owner marks behind a port the collector consults before removal

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

Applied/skipped marks are introduced by roadmap step 6 (tracking module), yet the collector must already preserve them: a marked posting is never removed by clean-up (AC-10), keeps its marks when a listing merges into it, when it closes and when it reopens (AC-06, AC-07, AC-11). The spec verifies these now against test data that carries marks (spec §5 note). Project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md` says each module owns its data and modules talk only through `app` exports.

## Decision drivers

- Owner marks belong to the posting and survive its closing (CONTEXT invariant).
- Module data ownership and parallel roadmap lanes (project ADR-0002).
- Behaviour testable before step 6 exists (spec §5 note).

## Considered options

1. **A `MarkedPostings` port owned by the collector** — "which of these posting ids carry a mark?"; default implementation answers none; tracking implements it in step 6 with its own table referencing `posting`.
2. **Mark columns on the collector's `posting` table now** — tracking later writes into the collector's table.

## Decision outcome

**Chosen:** Option 1. The collector keeps posting ids stable through merge, close and reopen (ADR-0005), consults the port before removing anything, and never reads or writes marks itself. In step 6 the tracking module provides the implementation through its `app` exports and its marks table references `posting` with delete restricted, so the database also refuses to remove a marked posting.

## Consequences

**Positive**
- Tracking owns marks end to end; the collector stays free of step-6 concepts.
- A database-level backstop arrives with step 6.

**Negative**
- Until step 6 ships, mark preservation is proven only through a test fake.

**Neutral**
- The port is a single query; if more modules need marks later they use tracking's exports directly.

## Links

- Spec: [[../spec.md]] AC-06, AC-07, AC-10, AC-11, §5 note
- SAD: [[../sad.md]] §5
- Related ADR: [[0005-store-postings-and-listings-separately-and-merge-at-collection-time]]
