---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-14"
feature_size: "S"
ticket: "roadmap step 5"
---

# 0002 — Decide location verdicts on read when search builds its snapshot

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

Each listing's location restriction is stored as the source stated it (collector AC-21). A verdict depends on the statement and on the country: the owner's own country, or a one-off country for a look (spec AC-06). The reading rules will be tuned. Spec §6 already makes every distinct statement in the collection a fixed test example, and new wording will keep arriving. On 2026-10-14 the collection held 161 open postings with about 50 distinct statements. Search pages its results from an in-memory snapshot of ordered ids (search ADR-0003) and drops marked postings as each page loads (applied-skipped ADR-0002). This decision fixes when a verdict is worked out and where it narrows the list.

## Decision drivers

- Spec §6: ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings and up to 20 skills, with the filter on.
- §1 quality goal 1: a fix to a reading rule must reach every posting without leaving stale, wrongly hidden ones behind.
- §1 quality goal 2: the total, hidden, "new" and waiting counts must agree with the list (AC-07, AC-09).
- Any country must work at once for a one-off look (AC-06).

## Considered options

1. **On read, when search builds the snapshot.** Search asks remote-filter for the verdict of every matching posting. The snapshot keeps only the shown postings (fits and check) in order, with the hidden count and the country it was built for. Each distinct statement is read once per search. A new country, a one-off look, or switching the filter on or off runs a new search.
2. **Parse at collection time and store the result.** The collector writes each listing's parsed countries, regions and zones to a new column, and search compares them with the country.
3. **On read, dropped as each page loads.** The snapshot keeps every match, and each page and the waiting count skip postings not open to the country, the way marks are skipped.

## Decision outcome

**Chosen:** Option 1. A rule fix takes effect on the next search with no backfill, which is a script that rewrites every stored row. Any country works at once. All counts come from the one pass that builds the snapshot. Option 2 would need a backfill after every rule change and would spread the filter across the collector and search. Option 3 brings nothing here: unlike a mark, a verdict cannot change while a snapshot lives, because the statement is frozen with it.

## Consequences

**Positive**
- No new column on collector tables, and no migration when a reading rule changes.
- The hidden count, the total and the "new" count come from the same pass (AC-07, AC-09). Pages walk the snapshot exactly as before. Marks are still dropped page by page.
- The waiting count applies the verdict for the snapshot's own country, so "2 new waiting" counts only what the filter would show (AC-09).

**Negative**
- Every search reads the statements again. A per-search cache keyed by statement text makes that one parse per distinct statement, about 50 today.
- Switching the filter off or on reloads the list from the top instead of keeping the scroll position.

**Neutral**
- A statement that changes at its source after a snapshot was built takes effect at the next search or refresh, like every other posting field in a snapshot (search ADR-0003).

## Links

- Spec: [[../spec.md]] AC-01 – AC-03, AC-06 – AC-09, §6
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0001-ship-the-filter-as-a-new-remote-filter-module-plus-main-screen-controls]], search-postings ADR-0003, applied-skipped ADR-0002
