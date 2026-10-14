---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-14"
feature_size: "S"
ticket: "roadmap step 5"
---

# 0001 — Ship the filter as a new remote-filter module plus main-screen controls

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

The remote filter has to read each listing's stated location, decide one verdict per posting for a country, remember the owner's country and whether the filter is on, and give the web app the list of countries to choose from (spec US-01 – US-06). Search builds the list and its counts (search ADR-0003, applied-skipped ADR-0002). The collector owns the stated locations and the "Anywhere" reading (spec AC-10). The owner sees all of it on the main screen, SCR-01 (ux-flows.md). This decision fixes where the filter's rules and state live, and so it fixes the feature's target surfaces.

## Decision drivers

- Project ADR-0002: one server module per roadmap capability, reached only through its `app/` exports. The roadmap's wave 4 already names `remote-filter/` (new) as step 5's zone.
- §1 quality goal 1: the verdict rules must be pure and unit-testable over the fixed example set (spec §6 Verdict correctness, Seasonal stability).
- Later steps need the verdict outside the list: alerts (roadmap step 7) must notify only about postings open to the owner, and the match score (step 4) may weigh it.
- ux-flows.md: no new screen. The filter lives on SCR-01.

## Considered options

1. **A new `remote-filter` module, with its controls on the main screen.** It owns the statement reader, the verdict, the country vocabulary, the owner's settings and their routes. Search asks it for verdicts through its `app/` export. The web app adds the country choice, off switch, one-off look, hidden count and "check location" mark to SCR-01.
2. **Inside the search module.** The rules go in `search/domain/location.ts`, and the country and on/off state go in new columns of the existing `search_state` row.

## Decision outcome

**Chosen:** Option 1. It follows project ADR-0002 and the roadmap's zone for step 5. It keeps the verdict reachable by alerts and the match score without a dependency on search. It also keeps search from growing a third concern on top of paging and marks.

`target_surfaces: [backend-service, web-frontend]`: the new module is part of the existing Fastify server, and SCR-01 in the existing React SPA gains the controls. The UI architecture is unchanged (SPA, TanStack Query), so there is no separate UI-architecture ADR.

## Consequences

**Positive**
- Verdict rules sit in `remote-filter/domain` as pure functions, tested without a database.
- Dependencies run search → remote-filter → collector through `app/` exports; nothing calls back into search, so there is no cycle.
- Alerts (step 7) can ask "fits for the owner?" straight from remote-filter.

**Negative**
- One more plugin in `app.ts` and one more table (the owner's settings row).
- Search still changes: its snapshot, counts and waiting count take the verdict into account (ADR-0002).

**Neutral**
- The collector still changes in its own code for the "Anywhere" reading (spec AC-10). That change follows the spec and is not part of this decision.

## Links

- Spec: [[../spec.md]] US-01 – US-06
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-decide-location-verdicts-on-read-when-search-builds-its-snapshot]], project `docs/adr/0002-feature-modules-mirror-roadmap.md`
