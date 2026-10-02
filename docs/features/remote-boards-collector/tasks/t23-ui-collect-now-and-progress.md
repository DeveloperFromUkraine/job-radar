---
id: T23
title: "Build CollectNowAction and RunProgress with 2 s polling"
layer: "ui"
deps: ["T22"]
blocks: []
acs: ["AC-15", "AC-16"]
files_hint: ["apps/web/src/features/source-health/CollectNowAction.tsx", "apps/web/src/features/source-health/RunProgress.tsx", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 69
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T23 — Build CollectNowAction and RunProgress with 2 s polling

## Place in the sequence

- **Blocked by:** T22 — Build the SCR-02 page states and settings / interrupted-run banners · **Blocks:** nothing · **Wave:** 3 (after T22).
- **Lane:** shares `docs/design-system.md` with T20; shares `docs/design-system.md` with T21 — serialized.

## Why (user story)

> **As an** owner
> **I want** to start a collection myself
> **So that** I don't wait for the schedule after fixing a problem or before a job-hunting session
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Lets the owner start a collection and watch it source by source.

## Inlined context

> | State | Trigger / condition | Components | Source-ref |
> |---|---|---|---|
> | idle | no request pending — stays enabled during a run, so a second press is answered in place (ux-flows Platform decisions) | NEW: Button (primary) | wireframe 02-d |
> | pending | request in flight | NEW: Button (disabled + inline spinner) | — |
> | started | 202 `started: true` → page switches to *run in progress* | NEW: RunProgress | wireframe 02-e |
> | nothing due | 200 `started: false` — "Nothing can be read yet." + next due per source from `next_due` (AC-15) | NEW: InlineBanner (info) under the button | wireframe 02-g |
> | already running | 409 `COLLECTOR_RUN_IN_PROGRESS` — "A run is already in progress." No second run (AC-16) | NEW: InlineBanner (info) under the button | wireframe 02-g |
> | error | 500 `INTERNAL`, 403 `FORBIDDEN_HOST` / `CROSS_SITE_REQUEST`, 415 `UNSUPPORTED_MEDIA_TYPE`, 400 `VALIDATION_ERROR` (contract) — API message + Retry | NEW: InlineBanner (error) under the button | wireframe 02-g |
>
> — `screens.md §SCR-02, collect-now action states, verbatim` · full text: [screens.md](../screens.md)

```text
02-e  run in progress  (finished variant: header "Last run finished 2 min ago", rows keep their outcome)
+--------------------------------------+
| Source health                        |
| [          Collect now           ]   |  stays enabled (AC-16 answered in place)
| Run in progress · started 09:00      |  RunProgress
|  Jobicy      collected  +4 · 1 upd   |
|  Himalayas   not due yet             |  (source not on the due list)
|  Remotive    reading…                |  outcome pending
|  WWR         disabled                |
| +----------------------------------+ |
| | ...source cards as 02-d...       | |
+--------------------------------------+

02-g  collect-now answers (under the button, replace each other)
+--------------------------------------+
| [          Collect now           ]   |
| (i) Nothing can be read yet.         |  200 started:false
|     Jobicy in 41 min · Himalayas     |
|     12:00 · Remotive 14:00           |
|--------------------------------------|
| (i) A run is already in progress.    |  409 COLLECTOR_RUN_IN_PROGRESS
|--------------------------------------|
| Couldn't start a collection.         |  error (500 / 403 / 415 / 400)
| <envelope message>        [ Retry ]  |
+--------------------------------------+
```

— `screens.md §SCR-02, wireframes 02-e 02-g, verbatim` · full text: [screens.md](../screens.md)

> **Chosen:** Option 1. Polling a loopback server every 2 s during a minutes-long run is negligible load and keeps the API plain JSON request/response, testable with the existing tools; the query library supplies caching, retries and loading/error states every later screen needs; a router gives source health a real URL for the marker.
>
> — `adr/0002-fetch-ui-data-with-tanstack-query-and-poll-run-progress.md §Decision outcome, Chosen, verbatim` · full text: [0002-fetch-ui-data-with-tanstack-query-and-poll-run-progress.md](../adr/0002-fetch-ui-data-with-tanstack-query-and-poll-run-progress.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `POST /api/v1/collector/runs` body `{}` → `202 {started: true, run, next_due}` · `200 {started: false, run: null, next_due}` · `409 COLLECTOR_RUN_IN_PROGRESS` · `400`/`403`/`415`/`500`.

— `contracts/openapi.yaml, operationId collectNow, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-15 — happy

> **Given** no collection run is in progress
> **When** the owner asks to collect now
> **Then** a run starts for every enabled source whose interval has passed since its last read, the owner sees it in progress, and then sees each source's outcome; if no enabled source may be read yet, no run starts and the owner sees when each source is next due
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** a collection run is already in progress
> **When** the owner asks to collect now
> **Then** no second run starts and the owner is told a run is already in progress
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] CollectNowAction: mutation, button stays enabled during a run, answers under the button — `CollectNowAction.tsx`
- [ ] RunProgress: per-source outcome list, finished variant — `RunProgress.tsx`
- [ ] `refetchInterval` 2 s while `current_run` is not null — `src/routes/SourceHealth.tsx`
- [ ] Register both in the inventory — `docs/design-system.md`
- [ ] Tests per state — `*.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Press during a run | 409 → "A run is already in progress." |
| Nothing due | "Nothing can be read yet." + next due |
| Owner leaves mid-run | Run continues; progress resumes on return |

## Definition of Done

- [ ] collect-now and progress tests pass, polling stops when the run ends
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
