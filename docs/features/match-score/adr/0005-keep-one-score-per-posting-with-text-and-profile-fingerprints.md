---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-15"
feature_size: "M"
ticket: "roadmap step 4"
---

# 0005 — Keep one score per posting with text and profile fingerprints

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

A score must stay visible but be marked stale when the posting's text changes at its source or another listing merges into it (spec AC-06), or when the profile changes (AC-10), until a new score replaces it. The collector detects changes by comparing title, description, location restriction and link, and stores no version or fingerprint.

## Decision drivers

- Spec AC-06, AC-10, AC-11: stale scores stay shown, marked, and keep their place among scored postings.
- Spec AC-12 / ADR-0002 cost: changes that do not affect the score (a new link) must not trigger re-scoring.
- §2 Organisational: roadmap step 10 changes the collector in parallel.

## Considered options

1. **Fingerprints in matching.** One current score row per posting, holding the parts, note, quoted claims and total, plus a hash of exactly the text that was scored and the profile version it was scored against. Stale when either differs from today's.
2. **A version counter in the collector,** bumped on every change, compared by matching.

## Decision outcome

**Chosen:** Option 1. The text hash covers only what the scorer reads — title, company, description and the open listings' location restrictions — so a changed link or a re-seen unchanged posting costs nothing; the collector is untouched. The score row is removed with its posting (cascade), like tracking marks (applied-skipped ADR-0003).

## Consequences

**Positive**
- No collector change and no clash with step 10.
- Staleness is computed, not maintained: no update path can forget to mark a score stale.

**Negative**
- Every list build and scorer pass recomputes the text hash of the postings it looks at; a cheap hash over a few kilobytes per posting.

**Neutral**
- Only the current score is kept; no history of earlier scores.

## Links

- Spec: [[../spec.md]] AC-06, AC-10, AC-11
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0004-read-scores-into-search-through-an-injected-reader-and-read-the-list-from-search]], applied-skipped ADR-0003
