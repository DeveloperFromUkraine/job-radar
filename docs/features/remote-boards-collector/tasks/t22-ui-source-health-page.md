---
id: T22
title: "Build the SCR-02 page states and settings / interrupted-run banners"
layer: "ui"
deps: ["T21"]
blocks: ["T23"]
acs: ["AC-12", "AC-20", "AC-27"]
files_hint: ["apps/web/src/routes/SourceHealth.tsx", "apps/web/src/features/source-health/"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 113
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T22 — Build the SCR-02 page states and settings / interrupted-run banners

## Place in the sequence

- **Blocked by:** T21 — Build SourceCard in every per-source state · **Blocks:** T23 — Build CollectNowAction and RunProgress with 2 s polling · **Wave:** 2 (after T21).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to see each source's health and have problems flagged in plain words
> **So that** a broken source never silently shrinks what I see
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** collection to catch up as soon as the app starts again, and the very first start to fill the last 30 days
> **So that** a night with the laptop closed doesn't leave me looking at yesterday's list
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to choose, in a settings file on my machine, which sources are enabled and which of their job categories count as tech
> **So that** the collection holds only roles I could want and I can adjust when a board changes its categories
>
> > **Visitor:** no user story — a visitor has no goal this feature serves; the role exists only to be kept out, covered by AC-17 and §6.1.
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Gives the owner the source-health screen around the cards.

## Inlined context

> | State | Trigger / condition | Components (from the inventory) | Source-ref |
> |---|---|---|---|
> | loading | first `getSourceHealth` request in flight | App shell, NEW: AppNav, NEW: SkeletonRow ×4 | wireframe 02-a |
> | error | `getSourceHealth` fails — 500 `INTERNAL`, 403 `FORBIDDEN_HOST` (contract); Flow 10 error branch | NEW: InlineBanner (error, with Retry) | wireframe 02-b |
> | empty | `any_run_finished: false` — "Nothing collected yet", each source's next due (AC-12 Given, Flow US-04 → G); cards show state + next due only | NEW: InlineBanner (info), NEW: SourceCard (compact), NEW: CollectNowAction | wireframe 02-c |
> | default | at least one run finished, no run in progress (AC-12) | NEW: CollectNowAction, NEW: SourceCard ×4 | wireframe 02-d |
> | run in progress | `current_run` not null — per-source progress, polled every 2 s; the run continues if the owner leaves (AC-15, Flow US-05 → F/H) | NEW: RunProgress, NEW: CollectNowAction | wireframe 02-e |
> | run finished | `current_run` turns null — `last_run` shows each source's outcome: collected, failed with reason, not due yet, disabled (Flow US-05 → G) | NEW: RunProgress (finished), NEW: SourceCard | wireframe 02-e (finished variant) |
> | run interrupted | `last_run.status: incomplete` — "The last run was interrupted. Nothing was closed because of it." (AC-20, Flow US-06 → H) | NEW: InlineBanner (info) | wireframe 02-f |
> | settings: defaults in use | `settings.notice: defaults_in_use` — no marker (AC-27) | NEW: InlineBanner (info) | wireframe 02-c |
> | settings: unreadable | `settings.problem` not null — the problem in plain words, "Collection keeps running on your last valid settings." (AC-27, Flow US-08 → D) | NEW: InlineBanner (warning) | wireframe 02-f |
> | validation | N/A: no input — settings are edited in the local file (spec §3) | — | — |
>
> — `screens.md §SCR-02, page-level states, verbatim` · full text: [screens.md](../screens.md)

```text
02-a  loading
+--------------------------------------+
| job-radar        Home  Source health |
+--------------------------------------+
| Source health                        |
| [====== disabled, spinner ======]    |  Collect now (disabled while loading)
| [ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ]  |  SkeletonRow ×4, card-shaped
| [ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ]  |
| [ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ]  |
+--------------------------------------+

02-b  error
+--------------------------------------+
| Source health                        |
| Couldn't load source health.         |  InlineBanner (error)
| <envelope message>        [ Retry ]  |
+--------------------------------------+

02-c  empty (nothing collected yet) + defaults in use + filling
+--------------------------------------+
| Source health                        |
| [          Collect now           ]   |
| (i) Nothing collected yet. Each      |  InlineBanner (info)
|     source is read when it is due.   |
| (i) Your settings file was missing,  |  InlineBanner (info) — no marker
|     so it was created with defaults. |
| +----------------------------------+ |
| | Jobicy                  Enabled  | |  SourceCard (compact)
| | Not collected yet · due in 1 min | |
| +----------------------------------+ |
| | Himalayas               Enabled  | |
| | Filling the last 30 days:        | |  filling
| | reached 14 Sep · next part 12:00 | |
| +----------------------------------+ |
+--------------------------------------+

02-f  run interrupted + settings unreadable
+--------------------------------------+
| Source health                        |
| [          Collect now           ]   |
| (!) Your settings file can't be      |  InlineBanner (warning) — marker on
|     read: <problem>. Collection      |  SCR-01 too
|     keeps running on your last valid |
|     settings.                        |
| (i) The last run was interrupted.    |  InlineBanner (info)
|     Nothing was closed because of it.|
| +----------------------------------+ |
| | ...source cards...               | |
+--------------------------------------+
```

— `screens.md §SCR-02, wireframes 02-a 02-b 02-c 02-f, verbatim` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `GET /api/v1/collector/source-health` → `SourceHealth` `{any_run_finished, settings{notice, problem, problem_since}, current_run, last_run, sources[]}`; errors `403`, `500`.

— `contracts/openapi.yaml, operationId getSourceHealth, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-12 — happy

> **Given** at least one collection run has finished
> **When** the owner opens source health
> **Then** they see for each source when it last succeeded, how many postings its last run added, updated and closed, and when it is next due
>
> > "Updated" — an updated posting (CONTEXT): known postings whose title, text, location restriction or link changed at this source, that gained a listing from another source, or that reopened.
> > Counts are per posting outcome, credited to the source that caused it: *added* — a new posting created from this source's listing; *updated* — an existing posting changed through this source, including this source's listing merging into it or reopening it; *closed* — postings that actually closed in this run where this source gave the last needed confirmation. Closures held back by AC-14 are shown separately as *held*, not as closed.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** a collection run was interrupted — the laptop slept or the app stopped mid-run
> **When** the app starts again
> **Then** the interrupted run is recorded as incomplete, nothing is closed on its basis, and new runs are not blocked by it; listings it already collected are kept, every read it made counts toward that source's allowed rate, a source whose fetch finished before the interruption counts that read as its own last success, and a source whose fetch did not finish does not
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-27 — error

> **Given** the owner's settings file is missing, or cannot be read
> **When** the app starts or a collection run starts
> **Then** a missing file is created with built-in defaults (every source except We Work Remotely enabled, a default tech category list per source) and source health says defaults are in use; an unreadable file leaves collection running on the last valid settings and source health names the problem in plain words; a file that can be read but names an unknown source or otherwise breaks the settings rules counts as unreadable as a whole; an unreadable file with no last valid settings yet (e.g. on the first start) runs on the built-in defaults and is not overwritten; a source the owner enables while its allowed rate is 0 (We Work Remotely until §8 Q1) shows as "enabled, not read until its limits are verified" and is never flagged as silent; a valid edit takes effect from the next run without restarting the app
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Page with the source-health query (focus refetch) — `src/routes/SourceHealth.tsx`
- [ ] Loading (4 SkeletonRows), error banner + Retry, empty ("Nothing collected yet") — `SourceHealth.tsx`
- [ ] Settings info / warning banners; interrupted-run info banner — `src/features/source-health/`
- [ ] Tests per state — `SourceHealth.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| `any_run_finished: false` | Empty state with next due per source |
| `last_run.status: incomplete` | Interrupted banner |
| `settings.problem` set | Warning banner; the marker shows on SCR-01 too |

## Definition of Done

- [ ] SCR-02 page-state tests pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
