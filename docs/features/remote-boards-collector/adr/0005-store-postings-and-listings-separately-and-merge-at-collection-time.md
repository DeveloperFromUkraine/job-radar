---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "roadmap step 2 — remote-boards-collector"
---

# 0005 — Store postings and listings separately and merge at collection time

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

The same role is often advertised on several sources and should reach the owner once, naming and linking every source (US-02, AC-04, AC-05). Owner marks belong to the posting and must survive merges, closing and reopening (AC-06, AC-07, AC-11, CONTEXT invariant). Merges are never re-decided (AC-21). Roadmap steps 3–7 (search, match score, remote filter, marks, alerts) all read this shape.

## Decision drivers

- One stable posting identity for marks, scores and alerts (AC-06, AC-11; roadmap steps 4–7).
- Every listing keeps its source's name and link (CONTEXT invariant, source terms).
- Earlier merges are not re-decided (AC-21).
- Retention removes postings, not just listings (AC-10).

## Considered options

1. **Two levels, merged at collection time** — `posting` and `listing` tables; a listing belongs to exactly one posting; the merge decision is made once at ingest and stored.
2. **Listings only, merged at read time** — "posting" is a grouping computed by queries over listings.

## Decision outcome

**Chosen:** Option 1. A domain function computes a match key (company and title normalized per AC-04: case, punctuation, generic "remote" wording, legal suffixes) and attaches a new listing to an existing, not-removed posting with the same key whose latest offer is within 7 days of the listing's publication time — reopening it if closed (AC-11) — or creates a new posting. Listing identity is (source, source item id), so a re-seen item updates its own row. Option 2 has no stable id for marks and could split a marked posting when the rule changes, breaking AC-06/AC-21.

## Consequences

**Positive**
- Stable posting ids for every later module; reads for search are a plain join.
- Merge rules are pure and unit-testable against AC-04/AC-05 examples.

**Negative**
- A wrong merge stays until the posting is removed — there is no un-merge in v1 (§11).
- Changing the normalization later only affects new matches unless keys are recomputed by a backfill (a script that walks every existing row).

**Neutral**
- Exact table and index shapes belong to the `data-model` stage.

## Links

- Spec: [[../spec.md]] US-02, AC-04, AC-05, AC-06, AC-10, AC-11, AC-21
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals]]
