---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "roadmap step 2 — remote-boards-collector"
---

# 0002 — Fetch UI data with TanStack Query and poll run progress

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

This is job-radar's first UI feature, so how the web app loads server data sets the pattern for every later screen (search, statuses, alerts). Source health must show a collection run in progress and keep it current while the page is open (`ux-flows.md` platform decisions — "how SCR-02 stays current is design's call"), and the main screen must link to source health from a problem marker. The SPA itself is already fixed by project ADR `docs/adr/0001-typescript-monorepo-react-fastify.md`.

## Decision drivers

- Owner sees the run in progress and each source's outcome (AC-15) and is told in place when a run is already going (AC-16).
- Problem marker on the main screen leads to source health (AC-13, SCR-01 → SCR-02).
- A regular run takes ≤ 5 min p95 (spec §6) — progress is minutes-scale, not milliseconds.
- `architecture-map.md` §Frontend: "State / data-fetching: not decided".

## Considered options

1. **TanStack Query + polling + React Router** — query cache and refetch-on-focus from the library; poll every 2 s while a run is in progress, otherwise on focus and every 60 s; two routes.
2. **TanStack Query + Server-Sent Events for run progress** — push progress over a long-lived HTTP stream.
3. **Plain fetch hooks + setInterval, no router** — no dependencies; screens switched by component state.

## Decision outcome

**Chosen:** Option 1. Polling a loopback server every 2 s during a minutes-long run is negligible load and keeps the API plain JSON request/response, testable with the existing tools; the query library supplies caching, retries and loading/error states every later screen needs; a router gives source health a real URL for the marker.

## Consequences

**Positive**
- One data-fetching pattern for every future screen; architecture-map §Frontend gets its answer.
- No long-lived connections to re-establish after the laptop sleeps.

**Negative**
- Up to 2 s lag between a source finishing and the screen showing it.
- Two new web dependencies (`@tanstack/react-query`, `react-router`).

**Neutral**
- Switching run progress to SSE later only changes the progress query, not the screens.

## Links

- Spec: [[../spec.md]] US-04, US-05, AC-13, AC-15, AC-16
- SAD: [[../sad.md]] §4, §8
- UX: [[../ux-flows.md]] Flow US-05
- Related ADR: [[0001-ship-collector-as-server-module-plus-web-source-health]]
