---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-15"
feature_size: "M"
ticket: "roadmap step 4"
---

# 0001 — Ship match score as a new matching module plus a profile screen and card additions

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

The match score needs a profile, a background scorer, spend accounting, CV reading and a scoring-health state on the server, and the score on each card, an order switch, a profile screen and a one-time data notice in the browser (spec §4, ux-flows SCR-01 – SCR-03). Every earlier feature shipped as one new server module plus changes to the existing single-page app (search, applied-skipped, remote-filter ADR-0001). The architecture map already reserves `apps/server/src/modules/matching/` for this step.

## Decision drivers

- Project ADR 0002: one module per roadmap capability, reached by others only through its `app/` exports.
- §2: one server process with one SQLite connection shared by every module (search sad §8); background work already runs in-process (collector).
- ux-flows: one new screen (SCR-03) and additions to SCR-01 and SCR-02, mobile-first.

## Considered options

1. **backend-service + web-frontend.** A new `matching` module in the server process, with its background scorer inside it; the existing React SPA gains a `/profile` route and card, list and source-health additions.
2. **Extend the search module** with the profile, scoring and spend accounting, since the score belongs to the list.

## Decision outcome

**Chosen:** Option 1. Profile, spend ledger, CV reading and an outside provider are foreign to search, which only builds and pages the list; putting them there would break project ADR 0002 (one module per roadmap capability) and make search depend on a paid outside call. Search instead reads scores through an injected reader (ADR-0004). The UI keeps the existing architecture — React SPA, react-router, TanStack Query, the design-system components and tokens — with one new route; no UI-architecture change is needed, so it is an inline note in §4, not a separate decision.

## Consequences

**Positive**
- Same shape as every shipped feature; lifecycle (start on ready, abort on close) is copied from the collector.
- No new process to start, watch or stop.

**Negative**
- A slow or failing provider call shares the event loop with the list; calls are asynchronous, so they wait without blocking, but the scorer must never do heavy synchronous work.

**Neutral**
- Running scoring in a separate worker process was not an option under §2 (one SQLite connection shared by every module); if ever needed, the scorer talks to the rest only through `matching/app/`, so it can move.

## Links

- Spec: [[../spec.md]] §4, US-01 – US-06
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0003-score-one-posting-at-a-time-with-the-messages-api-in-a-background-scorer]], remote-filter ADR-0001
