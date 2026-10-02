---
id: T24
title: "Prove limits, interruption and start-up end to end against a fake source server"
layer: "tests"
deps: ["T12", "T16", "T17", "T19"]
blocks: []
acs: ["AC-02", "AC-18", "AC-20"]
files_hint: ["apps/server/test/collector-e2e.integration.test.ts", "apps/server/test/helpers/fake-sources.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 45
status: "done"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T24 — Prove limits, interruption and start-up end to end against a fake source server

## Place in the sequence

- **Blocked by:** T12 — Verify spec §8 Q1/Q3, then build the Remotive, Himalayas and We Work Remotely adapters, T16 — Fill the last 30 days for a never-read source within its leftover budget, T17 — Run the daily clean-up through the MarkedPostings port, T19 — Serve collectNow and wire the collector plugin, scheduler and built SPA · **Blocks:** nothing · **Wave:** 6 (after T12, T16, T17, T19).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** new remote tech postings collected from every enabled source on that source's own schedule
> **So that** I never have to open the boards to see what is new
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** collection to catch up as soon as the app starts again, and the very first start to fill the last 30 days
> **So that** a night with the laptop closed doesn't leave me looking at yesterday's list
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Proves the collector keeps every source's terms and survives sleep and restarts.

## Inlined context

> - **How verify:** unit tests of due-ness and rate windows driven by a fake clock over 7 simulated days with restarts, interrupted runs and collect-now every minute, asserting reads per rolling window per source never exceed the limit; integration test against a local fake source server counting requests; freshness metric "per-listing difference between the source's publication time and its first collection time, reported per source" shown in source health and checked against the KPI "p90 ≤ 5 h from publication time for hourly-allowed sources while the app runs (§6 Freshness, same sample), within 14 days of shipping".
>
> — `sad.md §10, QG-1 How verify, verbatim` · full text: [sad.md](../sad.md)

> - **How verify:** domain unit tests per AC-04/05/07/08/09/11/14 fed by recorded responses from each source (complete, capped, failed, expired items); integration test that stops a run between two sources and restarts the app, asserting no closures and the AC-20 last-success rules; marks fake for the `MarkedPostings` port (ADR-0006); KPI "0 of 20 spot-checked closed postings found still open at their source, in the first 30 days".
>
> — `sad.md §10, QG-2 How verify, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-02 — domain invariant

> **Given** a source's interval (§6) has not yet passed since its last read
> **When** any collection run starts — scheduled, catch-up or collect-now
> **Then** that source is not read again in this run, and its source health shows when it is next due
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — happy

> **Given** an enabled source's own last successful read is older than its interval
> **When** the app starts
> **Then** a catch-up run for every such source begins within one minute of the start
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** a collection run was interrupted — the laptop slept or the app stopped mid-run
> **When** the app starts again
> **Then** the interrupted run is recorded as incomplete, nothing is closed on its basis, and new runs are not blocked by it; listings it already collected are kept, every read it made counts toward that source's allowed rate, a source whose fetch finished before the interruption counts that read as its own last success, and a source whose fetch did not finish does not
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Fake source server serving recorded fixtures and counting requests — `test/helpers/fake-sources.ts`
- [ ] 7-day simulation: fake clock, restarts, interrupted runs, collect-now every minute → reads per window ≤ limit — `collector-e2e.integration.test.ts`
- [ ] Stop a run between two sources, restart: run `incomplete`, no closures, AC-20 last-success rules — same file
- [ ] Start with stale sources: catch-up run opens within one minute — same file

## Edge cases

| Case | Behaviour |
|---|---|
| Restart every 10 minutes | Still within limits (reads counted when recorded) |
| Sleep mid-fetch | Fetch not finished → no last success |

## Definition of Done

- [ ] end-to-end tests pass in CI without network access
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
