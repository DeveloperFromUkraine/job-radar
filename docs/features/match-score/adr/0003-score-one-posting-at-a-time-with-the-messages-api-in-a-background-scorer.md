---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-15"
feature_size: "M"
ticket: "roadmap step 4"
---

# 0003 — Score one posting at a time with the Messages API in a background scorer

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

Postings in the owner's list must be scored in the background so the list never waits (spec AC-11, AC-13), within 15 minutes p95 of entering the list (spec §6 Scoring freshness), within the monthly cap (AC-12), and must keep working through provider outages (AC-14). The provider offers ordinary requests and a Message Batches API at half price whose results can take up to 24 hours.

## Decision drivers

- Spec §6 Scoring freshness: ≤ 15 minutes p95 with up to 50 new postings in an hour.
- Spec AC-12: no attempt starts unless its largest possible cost fits in what is left of the cap.
- Spec AC-14 / AC-18: provider problems leave postings pending and retried; unusable answers count three strikes.
- §2: background work runs in-process, started on ready and aborted on close, like the collector.

## Considered options

1. **One posting at a time, ordinary Messages API requests**, from an in-process scorer that takes the next posting from a queue.
2. **Message Batches API** for all scoring.
3. **Ordinary requests for new postings, batches for re-scoring** after profile edits.

## Decision outcome

**Chosen:** Option 1. A scoring finishes in seconds, so the freshness NFR holds with room to spare, and each attempt is a single spend reservation (ADR-0006). Batches would halve the price but break the 15-minute target and make reservations and pending states span hours and restarts; the mixed option doubles the calling and accounting code for a saving that only matters on large re-scores. Prompt caching of the fixed instructions and the profile recovers part of the batch saving.

## Consequences

**Positive**
- Simple state: a posting is pending until its one attempt ends; nothing in flight survives a restart.
- Freshness and cap checks happen per attempt.

**Negative**
- Full list price per scoring (cache reads aside).
- A large re-score after a profile edit runs serially; new postings go first (spec AC-10, AC-13), so they are not delayed by it.

**Neutral**
- Concurrency is 1; raising it later is a configuration change if volume grows.

## Links

- Spec: [[../spec.md]] AC-10 – AC-14, AC-18, §6
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage]], collector ADR-0002
