---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-15"
feature_size: "M"
ticket: "roadmap step 4"
---

# 0004 — Read scores into search through an injected reader and read the list from search

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

Search must show each posting's score and order the list by best match, fixed when the snapshot is built (spec AC-11, search ADR-0003). Matching must know the owner's list — unmarked open postings that match the typed skills and are shown by the remote filter — to decide what to score (spec AC-13); that definition belongs to search. A direct import in both directions would make the two modules depend on each other.

## Decision drivers

- Project ADR 0002: modules reach each other only through `app/` exports; no import cycles.
- Spec AC-13: scoring follows the list the owner sees, including after a change of skills, filter or look.
- Spec §6: ≤ 1 s p95 to the first 50 postings, in either order.

## Considered options

1. **Injected score reader.** Search defines a `ScoreReader` in `search/app/deps.ts` (as it does `LocationReader`); `app.ts` supplies matching's implementation. Matching imports a new search export that returns the owner's current list.
2. **Search queues work.** When it builds a snapshot, search hands matching the ids to score; dependency only search → matching.
3. **Matching rebuilds the list itself** from collector, remote-filter, tracking and the last skills.

## Decision outcome

**Chosen:** Option 1. The list is defined once, in search; matching reads it; search reads scores through an interface wired at the composition root, so no import cycle exists. Scores and the best-match order are taken when the snapshot is built, as remote-filter verdicts are (remote-filter ADR-0002). Option 2 leaves postings collected between visits unscored until the owner opens the screen, breaking the freshness NFR; option 3 duplicates the list rules, which would drift.

## Consequences

**Positive**
- One definition of the owner's list; scoring and showing always agree.
- Search tests keep their seams: a stand-in `ScoreReader` simulates every score state.

**Negative**
- The list export must be cheap enough for the scorer to call after every collection run and every list change; it reuses search's matching and the remote filter's verdicts.

**Neutral**
- The snapshot gains a score per posting and, in best-match order, a different id order; paging, marks and counts are unchanged.

## Links

- Spec: [[../spec.md]] AC-01, AC-11, AC-13
- SAD: [[../sad.md]] §4, §5, §6
- Related ADR: search-postings ADR-0003, remote-filter ADR-0002, [[0005-keep-one-score-per-posting-with-text-and-profile-fingerprints]]
