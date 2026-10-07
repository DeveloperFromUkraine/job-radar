---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-10-07"
feature_size: "S"
ticket: ""
---

# 0001 — Ship marks as a new tracking module plus mark actions on the main screen

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

Roadmap step 6 lets the owner mark a posting applied or skipped, so the main list holds only postings they have not decided on (spec §1). The server already has a `collector` module that owns postings and a `search` module that builds the main list. The collector consults a marks port before clean-up removes anything, and the port's implementation was left to step 6 (collector ADR-0006). The feature needs a home for the marks, their routes and that port, plus UI on the main screen (SCR-01, ux-flows).

## Decision drivers

- Project ADR-0002: one feature module per roadmap step; modules reach each other only through `app/` exports.
- Collector ADR-0006: the collector never reads or writes marks; "tracking provides the implementation through its `app` exports".
- The owner works only through the web app on loopback (spec §4, AC-16); no new kind of caller.
- Later steps (alerts, step 7) will need to know what the owner already marked.

## Considered options

1. **A new `tracking` module plus mark actions on SCR-01.** `modules/tracking/` owns the marks table, the mark, change, clear and undo use cases and routes, the collector's port implementation, and the look-alike rule. Search asks tracking which postings are marked; the web adds the actions, the Undo notice, the look-alike hint and the "Show marked postings" switch to the main screen.
2. **Marks inside the `search` module.** The same surfaces, but the marks table and routes live in `modules/search/`, and search implements the collector's port.

## Decision outcome

**Chosen:** Option 1, with `target_surfaces: [backend-service, web-frontend]`. It is the module the roadmap and the architecture map planned for step 6 and the one collector ADR-0006 names, it keeps search to one job (building lists), and a later alerts module can read marks without depending on search. Dependencies run search → tracking → collector through `app/` exports; the collector reaches tracking only through its port, wired in `app.ts`, so there is no import cycle.

## Consequences

**Positive**
- Marks have one owner end to end: storage, rules, routes and the collector's port.
- Search changes stay small: it filters by tracking's answer and shows the hint tracking computes.

**Negative**
- One more module, and a three-module chain (search → tracking → collector) to keep in mind when testing.

**Neutral**
- The collector gains read-only exports that tracking and search need (closed postings by id, merge normalization, retention outlook); its rules do not change.

## Links

- Spec: [[../spec.md]] US-01 – US-07
- SAD: [[../sad.md]] §4, §5
- Related ADR: collector [ADR-0006](../../remote-boards-collector/adr/0006-keep-owner-marks-behind-a-port-the-collector-consults-before-removal.md), [[0003-keep-one-mark-row-per-posting-with-its-previous-state-deleted-with-the-posting]]
