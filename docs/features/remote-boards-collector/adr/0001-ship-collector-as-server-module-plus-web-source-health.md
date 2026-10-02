---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "roadmap step 2 — remote-boards-collector"
---

# 0001 — Ship the collector as a server module plus a web source-health screen

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

The collector reads job sources on a schedule (spec US-01, US-06) and the owner needs one screen to see source health, start a collection and watch it run, plus a problem marker on the main screen (spec §1 owner-facing surface, AC-12, AC-13, AC-15; `ux-flows.md` SCR-01, SCR-02). We must decide which runnable parts (C4 containers) the feature introduces; every later stage (api, screens, tasks, plan-tests) gates its output on this choice.

## Decision drivers

- One owner on one laptop; the app runs only while the owner runs it (spec §3, architecture-map constraint).
- App responds to the owner ≤ 5 s after start, even while catch-up or the first fill runs (spec §6).
- At most one collection run at a time; collect-now must see a run in progress (AC-16) — easiest when the scheduler and the API share a process.
- Architecture map already plans "scheduled background collection" inside the Fastify server.

## Considered options

1. **Backend service + web frontend** — a `collector` module in the Fastify server runs the schedule in-process; the React app adds the source-health screen and the marker.
2. **Backend service + separate worker + web frontend** — collection in its own Node process sharing the SQLite file.

## Decision outcome

**Chosen:** Option 1, `target_surfaces: [backend-service, web-frontend]`. One process keeps one SQLite writer, makes "one run at a time" and collect-now an in-process concern, and matches the map; the ≤ 5 s responsiveness target is protected by keeping collection I/O-bound and yielding (§8), not by a second process.

## Consequences

**Positive**
- One thing to start; no inter-process signalling for collect-now or progress.
- No concurrent SQLite writers.

**Negative**
- Collection work shares the event loop with the API; CPU-heavy steps (HTML-to-text, normalization of thousands of items during the first fill) must be chunked so the API keeps answering.

**Neutral**
- Moving collection to a worker or an always-on host later means extracting the module's `app` layer into a second entry point — the module boundary already allows it.

## Links

- Spec: [[../spec.md]] §1, US-04, US-05, AC-16
- SAD: [[../sad.md]] §4, §5
- UX: [[../ux-flows.md]] SCR-01, SCR-02
- Related ADR: [[0002-fetch-ui-data-with-tanstack-query-and-poll-run-progress]], [[0003-drive-collection-from-a-one-minute-due-check-over-persisted-state]]
