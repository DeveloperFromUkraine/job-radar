---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-10-07"
feature_size: "S"
ticket: ""
---

# 0002 — Snapshot every matching posting and drop marked ones as each page loads

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

Search pages the main list from an in-memory snapshot of ordered posting ids (search ADR-0003). Marks now change what belongs in the list while it is on screen: the owner marks postings in this window, and marks can be set or cleared in another window. AC-12 requires that a later page leaves out postings marked since the list loaded, includes postings whose mark was cleared since in their publication-time position, and never skips an unmarked posting that belonged after the last one shown.

## Decision drivers

- AC-12: no skips, cleared postings return in place, marked ones leave.
- AC-13: the empty state says how many matching open postings are marked.
- Spec §6: search ≤ 1 s p95 first page and next page with 10,000 open and 5,000 marked postings.
- Search ADR-0003 stays valid: a merge can move a posting earlier, so pages must come from a fixed order.

## Considered options

1. **Snapshot every matching posting, marked included; drop marked ones as each page loads.** The snapshot keeps all matching open postings in order. Each page (the first and every next) reads the set of currently marked ids from tracking, walks the snapshot from the cursor, skips marked ids and stops at 50 unmarked ones; the cursor is the snapshot position after the last id read.
2. **Snapshot only unmarked postings.** Marked postings leave at load; a next page also drops postings marked since. A posting cleared in another window does not return until a refresh, which contradicts AC-12 and would need a spec change.

## Decision outcome

**Chosen:** Option 1. It meets AC-12 word for word: a posting cleared since loading is still in the snapshot, so it appears in its place on the next page, and the cursor moves past everything read, so nothing unmarked is skipped. The count of matching open postings that are marked (AC-13) falls out of the same pass. Search ADR-0003's snapshot shape and limits are unchanged; only what a page returns changes.

## Consequences

**Positive**
- AC-12 and AC-13 come from one rule, testable with a fake clock and fake marks.
- No change to how snapshots are stored or expired.

**Negative**
- Every page reads the marked-id set (at most a few thousand ids) — one query per page.
- When most postings are marked, a page walks far into the snapshot to find 50 unmarked ones; the walk is bounded by the snapshot size (10,000 in the NFR).

**Neutral**
- The cursor stays an opaque snapshot position, but a page can now cover more than 50 positions; `api` documents it as opaque.
- The marked view (AC-05) uses the same mechanism in reverse: a snapshot of marked ids ordered by mark time.

## Links

- Spec: [[../spec.md]] AC-05, AC-12, AC-13, §6
- SAD: [[../sad.md]] §4, §5
- Related ADR: search [ADR-0003](../../search-postings/adr/0003-page-results-from-an-in-memory-snapshot-of-ordered-ids.md), [[0001-ship-marks-as-new-tracking-module-plus-main-screen-actions]]
