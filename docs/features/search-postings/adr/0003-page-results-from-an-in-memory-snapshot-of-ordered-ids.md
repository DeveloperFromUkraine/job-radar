---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-10-04"
feature_size: "S"
ticket: ""
---

# 0003 — Page results from an in-memory snapshot of ordered ids

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

Results come 50 at a time, and asking for more must never repeat a posting already shown or skip one that belonged after it, while collection runs keep adding, merging, reopening and closing postings (AC-15, AC-16). A merged posting carries the earliest publication time among its listings (collector ADR-0005), so a merge can move a posting earlier in the order after the owner loaded the list.

## Decision drivers

- No repeats or gaps across pages while collection runs; postings collected after loading are counted, not inserted (AC-16).
- Show more ≤ 1 s p95 with 10,000 open postings (spec §6).
- The order the owner sees is the publication-time order the posting displays (AC-03).

## Considered options

1. **In-memory snapshot** — the first request computes the whole ordered id list and keeps it in the server's memory under a snapshot id with its load moment; each next page slices the next 50 ids and reads their current details.
2. **Keyset cursor over a frozen sort key** — the client sends the last item's key and the load moment; the server rescans each time, ordering by a sort key the collector would store at first collection so it never moves.

## Decision outcome

**Chosen:** Option 1. The snapshot makes "no repeats, no gaps" true by construction, and a next page costs no rescan. Option 2 survives restarts, but every page rescans, it needs a new column and migration in the collector, and its frozen key would drift from the publication time the owner sees, so the order would no longer match what is shown.

## Consequences

**Positive**
- AC-16 holds by construction; "show more" reads only 50 postings by id.
- The waiting count needs only postings first collected after the snapshot's load moment.

**Negative**
- Snapshots are lost on server restart and are capped (20, oldest evicted, 2 h idle expiry); the web then reloads the list from the newest.
- A posting in a later page that closed after loading is left out, so the delivered count can fall short of the total shown at load.

**Neutral**
- Persisting snapshots in SQLite is a contained change in `search/infra` if restarts ever become a real annoyance.

## Links

- Spec: [[../spec.md]] AC-03, AC-15, AC-16, §6
- SAD: [[../sad.md]] §4, §5, §6 flow 2, §10 QG-3, §11
- Related ADR: [[0002-match-skills-by-scanning-open-posting-text-in-the-app]]
