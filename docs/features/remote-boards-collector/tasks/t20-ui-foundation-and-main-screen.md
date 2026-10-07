---
id: T20
title: "Set up query + router, the shared primitives and SCR-01 with the problem marker"
layer: "ui"
deps: []
blocks: ["T21"]
acs: ["AC-13"]
files_hint: ["apps/web/package.json", "apps/web/src/main.tsx", "apps/web/src/App.tsx", "apps/web/src/api/", "apps/web/src/components/", "apps/web/src/routes/", "apps/web/src/features/source-health/ProblemMarker.tsx", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "L"
context_budget: "M"
# measured inlined lines: 84
status: "done"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T20 — Set up query + router, the shared primitives and SCR-01 with the problem marker

## Place in the sequence

- **Blocked by:** nothing — starts in wave 0 · **Blocks:** T21 — Build SourceCard in every per-source state · **Wave:** 0 (no prerequisites).
- **Lane:** shares `docs/design-system.md` with T21; shares `docs/design-system.md` with T23 — serialized.

## Why (user story)

> **As an** owner
> **I want** to see each source's health and have problems flagged in plain words
> **So that** a broken source never silently shrinks what I see
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Shows the owner, on the main screen, that a source has a problem.

## Inlined context

> **Chosen:** Option 1. Polling a loopback server every 2 s during a minutes-long run is negligible load and keeps the API plain JSON request/response, testable with the existing tools; the query library supplies caching, retries and loading/error states every later screen needs; a router gives source health a real URL for the marker.
>
> — `adr/0002-fetch-ui-data-with-tanstack-query-and-poll-run-progress.md §Decision outcome, Chosen, verbatim` · full text: [0002-fetch-ui-data-with-tanstack-query-and-poll-run-progress.md](../adr/0002-fetch-ui-data-with-tanstack-query-and-poll-run-progress.md)

> | State | Trigger / condition | Components (from the inventory) | Source-ref |
> |---|---|---|---|
> | default | `has_problem: false` — no marker (Flow US-04 → C) | App shell, NEW: AppNav | wireframe 01-a |
> | problem | `has_problem: true` — any failing, silent, overdue, held-back, unusual-location or unreadable-settings problem (AC-13 note, AC-14, AC-25, AC-27); clears by itself on refetch (Flow US-04 → K→J) | App shell, NEW: AppNav, NEW: ProblemMarker | wireframe 01-b |
> | loading | first `getCollectorProblems` request in flight — shown as default, no marker, no skeleton (the marker is additive, never a blocker) | App shell, NEW: AppNav | as 01-a |
> | error | `getCollectorProblems` fails — 500 `INTERNAL`, 403 `FORBIDDEN_HOST` (contract), Flow 10 error branch | App shell, NEW: AppNav, NEW: InlineBanner (error, with Retry) | wireframe 01-c |
> | empty | N/A: SCR-01 has no list in this feature — postings arrive in roadmap step 3 | — | — |
> | validation | N/A: no input on this screen | — | — |
>
> — `screens.md §SCR-01 states, verbatim` · full text: [screens.md](../screens.md)

```text
01-a  default / loading
+--------------------------------------+
| job-radar        Home  Source health |  AppNav
+--------------------------------------+
|                                      |
|  Postings will show here once        |
|  browsing arrives (roadmap step 3).  |
|  Collection status: Source health.   |
|                                      |
+--------------------------------------+

01-b  problem
+--------------------------------------+
| job-radar        Home  Source health |
+--------------------------------------+
| (!) A source has a problem that can  |  ProblemMarker — whole block is a
|     cost you postings.               |  link to /sources, 44px+ target,
|     Open source health  >            |  danger tone
+--------------------------------------+
|  Postings will show here once        |
|  browsing arrives (roadmap step 3).  |
+--------------------------------------+

01-c  error
+--------------------------------------+
| job-radar        Home  Source health |
+--------------------------------------+
| Couldn't check your sources.         |  InlineBanner (error): the API
| <envelope message>        [ Retry ]  |  message + Retry
+--------------------------------------+
|  Postings will show here once ...    |
+--------------------------------------+
```

— `screens.md §SCR-01, wireframes 01-a..01-c, verbatim` · full text: [screens.md](../screens.md)

> - Times are shown relative and short ("2 h ago", "in 40 min"); the exact local time is in the element's `title`.
> - Source names link to the source's own site (attribution, CLAUDE.md §Source terms).
> - Every text from the API (`reason`, `failure_reason`, `problem`, error `message`) is rendered as text, never as markup (sad.md §8).
>
> — `screens.md §Source, cross-screen rules, verbatim` · full text: [screens.md](../screens.md)

> - **Errors:** inline, next to what failed — a banner at the top of the affected section for request failures
>   (showing the API envelope's `message`, with a retry action); no toasts for errors.
> - **Loading:** skeleton rows shaped like the content for lists; a disabled button with an inline spinner for
>   actions; never a full-screen blocker.
> - **Touch & reach:** interactive targets at least 44×44px; the primary actions on a posting (apply / skip) sit in
>   thumb reach at the bottom of the card on phones.
>
> — `docs/design-system.md §Interaction & writing conventions, Errors + Loading + Touch, verbatim` · full text: [design-system.md](../../../../docs/design-system.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `GET /api/v1/collector/problems` → `ProblemSummary` `{has_problem, problems[{source_id|null, kind}]}`; errors `403 FORBIDDEN_HOST`, `500 INTERNAL` in `{ "error": { "code", "message" } }`.

— `contracts/openapi.yaml, operationId getCollectorProblems, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-13 — error

> **Given** a source has failed on two consecutive due runs, returned zero items (not merely zero new ones) on two consecutive due runs, or has not been read for more than twice its interval while the app was running
> **When** the owner opens the app
> **Then** that source is flagged with a plain-language reason in source health, the app's main screen shows that a source has a problem, and the flag clears by itself after the source's next successful read that returns items
>
> > Main-screen marker — shown while any flag that can cost the owner postings is up: failing / silent / overdue (AC-13, clears after the next successful read that returns items), closures held back (AC-14, clears when the next run of that source is at or under 30%), unusual unknown-location share (AC-25, clears when that source's next run is back under the threshold), unreadable settings file (AC-27, clears after the next valid read). Shown only in source health, without the marker: a category that matched nothing (AC-24) and defaults in use (AC-27). There is no in-app control to accept held closures in v1.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `@tanstack/react-query` + `react-router`; QueryClientProvider + routes `/` and `/sources` — `apps/web/package.json`, `src/main.tsx`, `src/App.tsx`
- [ ] Typed API client for the three operations (types from the contract) — `src/api/collector.ts`
- [ ] Shared primitives with tokens only: AppNav, Button (incl. disabled + spinner), InlineBanner (error / warning / info), SkeletonRow, Badge — `src/components/`
- [ ] SCR-01: problems query on focus + every 60 s; ProblemMarker; error banner with Retry — `src/routes/Home.tsx`, `src/features/source-health/ProblemMarker.tsx`
- [ ] Register the five primitives in the inventory (file:line + states) — `docs/design-system.md`
- [ ] Testing Library tests per state with mocked fetch — `src/**/*.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| `has_problem` flips to false | Marker disappears on next refetch |
| Request fails | Inline banner with message + Retry; no marker |
| Still loading | Default without marker — never a blocker |

## Definition of Done

- [ ] SCR-01 state tests pass
- [ ] primitives registered in docs/design-system.md
- [ ] no raw hex / stock palette (lint or review)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
