---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-10-04"
feature_size: "S"
ticket: ""
---

# 0002 — Match skills by scanning open-posting text in the app

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

AC-02 defines a precise rule: a skill matches where its exact text — symbols included, letter case ignored — stands in any open listing's title or description with no letter or digit next to it ("C#", ".NET", "Node.js" kept whole; "Go" not in "Google"). The spec's goal is zero silently missing matches, and the search must answer within 1 s p95 over 10,000 open postings. Descriptions average about 5.7 KB today, so 10,000 postings carry roughly 60–70 MB of text.

## Decision drivers

- Match correctness: 100% of the fixed AC-02 examples, in title and in description (spec §6).
- Search response ≤ 1 s p95 with 10,000 open postings and up to 20 skills (spec §6).
- Owner input must be matched literally, never interpreted as a pattern or command (spec §6.1).
- Postings and listings are the collector's tables (ADR-0001).

## Considered options

1. **Scan in the app** — the collector export streams open postings with their open listings' text (plus closed listings' source and status, never matched); one pure matcher in `search/domain` (escaped skills, one case-insensitive Unicode pattern with boundary look-arounds) decides matches and in-title flags.
2. **SQLite FTS5 trigram index as a pre-filter, then the same matcher** — an index of every three-character fragment narrows candidates before the exact check.

## Decision outcome

**Chosen:** Option 1. It implements AC-02 exactly in one unit-tested function, needs no migration or trigger on the collector's tables, and is expected to fit the 1 s budget at 10,000 postings. Option 2 scales further, but needs a second index and triggers in the collector's module and cannot serve skills shorter than three characters ("Go", "R", "C#", "UX"), which would still need the full scan — two code paths for the same rule.

## Consequences

**Positive**
- One rule, one place: the matcher is the single source of truth for AC-02 and AC-06, tested over the fixed example list.
- No schema change in the collector; nothing to keep in sync at ingest.

**Negative**
- Every search reads all open-posting text; cost grows linearly with the open collection and runs on the shared event loop.

**Neutral**
- If the QG-2 test or logged durations show p95 above 1 s, the upgrade path is an in-memory text cache keyed by the last finished run, then a substring pre-filter — the matcher stays as the final check (SAD §11).

## Links

- Spec: [[../spec.md]] AC-02, AC-06, §6, §6.1
- SAD: [[../sad.md]] §4, §8, §10 QG-1/QG-2, §11
- Related ADR: [[0001-ship-search-as-new-server-module-plus-main-screen-list]]
