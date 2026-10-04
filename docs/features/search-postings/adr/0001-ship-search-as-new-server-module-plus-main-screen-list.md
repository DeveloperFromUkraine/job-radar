---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-10-04"
feature_size: "S"
ticket: ""
---

# 0001 — Ship search as a new server module plus the main-screen list

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

The owner needs to see the postings the collector holds, searched by skills, on the main screen (SCR-01). The postings and listings belong to the collector module (collector ADR-0005). The search rules — skills check, matching, order, visits, paging — are new and are what roadmap steps 4–7 will extend, while step 11 (Polish board adapters) works inside the collector in the same wave.

## Decision drivers

- Project ADR-0002: one module per roadmap zone; modules reach each other only through `app/` exports; the roadmap execution path names `search/` (new) for step 3, parallel with step 11 in `collector/`.
- Every acceptance-criterion rule (AC-02, AC-03, AC-05, AC-09, AC-14) must be unit-testable without network or database (CLAUDE.md layering).
- The owner-facing surface is the existing main screen, which keeps the problem marker (spec §1).

## Considered options

1. **New `search` module + SCR-01 list** — `modules/search/{domain,app,infra,ports}`; postings read through a new read-only export in `collector/app/`; the web main screen gains the skills field and the list.
2. **Search inside the collector module** — rules and routes added to `modules/collector/`, querying its own tables directly.

## Decision outcome

**Chosen:** Option 1. It follows project ADR-0002, keeps step 3 and step 11 in disjoint folders, and keeps the collector's tables behind its own `app` layer, so later steps (score, filter, marks) extend `search` rather than the collector.

## Consequences

**Positive**
- `target_surfaces: [backend-service, web-frontend]`; each surface's work lands in its own folder.
- The collector's change is one read-only export; its schema is untouched.

**Negative**
- Search cannot push matching into the collector's SQL; it receives rows and matches in its own domain (see ADR-0002).
- The SQLite handle moves from the collector's plugin to `app.ts` so both modules share one connection.

**Neutral**
- If search later needs its own derived data (a text cache or index), it lives in `search/infra`, fed from the same export.

## Links

- Spec: [[../spec.md]] US-01 – US-07
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-match-skills-by-scanning-open-posting-text-in-the-app]], project `docs/adr/0002-feature-modules-mirror-roadmap.md`
