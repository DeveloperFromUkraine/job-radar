---
status: approved
feature_size: "M"
tool: "code"
updated_at: "2026-10-02"
---

# Screens — remote-boards-collector

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code (from `docs/design-system.md`)
- **File:** inline wireframes below — drawn at phone width (mobile-first canon); wider layouts only add columns.

Inputs: `ux-flows.md` (SCR-01, SCR-02 and Flows US-04, US-05, US-06, US-08), `sad.md` §6 Flows 2 and 10, `contracts/openapi.yaml` (`getCollectorProblems`, `getSourceHealth`, `collectNow`), spec §5. Data fetching per ADR-0002 (TanStack Query; polling only for run progress). Routes: `/` (SCR-01) and `/sources` (SCR-02), both inside the App shell with `NEW: AppNav`.

Cross-screen rules (from the design-system conventions):
- Times are shown relative and short ("2 h ago", "in 40 min"); the exact local time is in the element's `title`.
- Source names link to the source's own site (attribution, CLAUDE.md §Source terms).
- Every text from the API (`reason`, `failure_reason`, `problem`, error `message`) is rendered as text, never as markup (sad.md §8).

## Screens

### SCR-01 — Main screen

Home of the app; a shell until roadmap step 3 adds postings. Its only feature-specific job is the problem marker (AC-13). Data: `getCollectorProblems`, refetched on window focus and every 60 s (the due-check cadence), so the marker appears and clears on an open screen without a reload.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | `has_problem: false` — no marker (Flow US-04 → C) | App shell, NEW: AppNav | wireframe 01-a |
| problem | `has_problem: true` — any failing, silent, overdue, held-back, unusual-location or unreadable-settings problem (AC-13 note, AC-14, AC-25, AC-27); clears by itself on refetch (Flow US-04 → K→J) | App shell, NEW: AppNav, NEW: ProblemMarker | wireframe 01-b |
| loading | first `getCollectorProblems` request in flight — shown as default, no marker, no skeleton (the marker is additive, never a blocker) | App shell, NEW: AppNav | as 01-a |
| error | `getCollectorProblems` fails — 500 `INTERNAL`, 403 `FORBIDDEN_HOST` (contract), Flow 10 error branch | App shell, NEW: AppNav, NEW: InlineBanner (error, with Retry) | wireframe 01-c |
| empty | N/A: SCR-01 has no list in this feature — postings arrive in roadmap step 3 | — | — |
| validation | N/A: no input on this screen | — | — |

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

### SCR-02 — Source health

Per-source state, settings notices, collect-now and the run in progress. Data: `getSourceHealth` (refetched on focus; every 2 s while `current_run` is not null, otherwise every 60 s — ADR-0002, Flow 2) and the `collectNow` mutation. One card per source in registry order, stacked at every width — with four sources a wide table adds nothing (review 2026-10-02, C3).

**Page-level states**

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | first `getSourceHealth` request in flight | App shell, NEW: AppNav, NEW: SkeletonRow ×4 | wireframe 02-a |
| error | `getSourceHealth` fails — 500 `INTERNAL`, 403 `FORBIDDEN_HOST` (contract); Flow 10 error branch | NEW: InlineBanner (error, with Retry) | wireframe 02-b |
| empty | `any_run_finished: false` — "Nothing collected yet", each source's next due (AC-12 Given, Flow US-04 → G); cards show state + next due only | NEW: InlineBanner (info), NEW: SourceCard (compact), NEW: CollectNowAction | wireframe 02-c |
| default | at least one run finished, no run in progress (AC-12) | NEW: CollectNowAction, NEW: SourceCard ×4 | wireframe 02-d |
| run in progress | `current_run` not null — per-source progress, polled every 2 s; the run continues if the owner leaves (AC-15, Flow US-05 → F/H) | NEW: RunProgress, NEW: CollectNowAction | wireframe 02-e |
| run finished | `current_run` turns null — `last_run` shows each source's outcome: collected, failed with reason, not due yet, disabled (Flow US-05 → G) | NEW: RunProgress (finished), NEW: SourceCard | wireframe 02-e (finished variant) |
| run interrupted | `last_run.status: incomplete` — "The last run was interrupted. Nothing was closed because of it." (AC-20, Flow US-06 → H) | NEW: InlineBanner (info) | wireframe 02-f |
| settings: defaults in use | `settings.notice: defaults_in_use` — no marker (AC-27) | NEW: InlineBanner (info) | wireframe 02-c |
| settings: unreadable | `settings.problem` not null — the problem in plain words, then "Collection keeps running on your last valid settings." or, when `running_on: defaults`, "Collection runs on the built-in defaults until the file can be read." (AC-27, Flow US-08 → D; review A8) | NEW: InlineBanner (warning) | wireframe 02-f |
| validation | N/A: no input — settings are edited in the local file (spec §3) | — | — |

**Collect-now action states** (`collectNow`, Flow 2, AC-15/16)

| State | Trigger / condition | Components | Source-ref |
|---|---|---|---|
| idle | no request pending — stays enabled during a run, so a second press is answered in place (ux-flows Platform decisions) | NEW: Button (primary) | wireframe 02-d |
| pending | request in flight | NEW: Button (disabled + inline spinner) | — |
| started | 202 `started: true` → page switches to *run in progress* | NEW: RunProgress | wireframe 02-e |
| nothing due | 200 `started: false` — "Nothing can be read yet." + next due per source from `next_due` (AC-15) | NEW: InlineBanner (info) under the button | wireframe 02-g |
| already running | 409 `COLLECTOR_RUN_IN_PROGRESS` — "A run is already in progress." No second run (AC-16) | NEW: InlineBanner (info) under the button | wireframe 02-g |
| error | 500 `INTERNAL`, 403 `FORBIDDEN_HOST` / `CROSS_SITE_REQUEST`, 415 `UNSUPPORTED_MEDIA_TYPE`, 400 `VALIDATION_ERROR` (contract) — API message + Retry | NEW: InlineBanner (error) under the button | wireframe 02-g |

**Source card states** (one per `sources[]` row)

| State | Trigger / condition | Components | Source-ref |
|---|---|---|---|
| healthy | enabled, `flags: []` — last success, last run added / updated / closed / held, next due, reads in the last 24 h, freshness p90 (AC-12, spec §6) | NEW: SourceCard, NEW: Badge (enabled) | wireframe 02-d |
| flagged | a `failing`, `silent` or `overdue` flag — the reason in plain words (AC-03, AC-13; Flow US-04 → K) | NEW: SourceCard, NEW: Badge (problem), flag reason list | wireframe 02-d |
| possibly changed | a `held_back` or `unknown_location` flag — the reason names the number; held closures shown as *held* (AC-14, AC-25; Flow US-04 → L) | NEW: SourceCard, NEW: Badge (problem) | wireframe 02-d |
| category notice | a `category_unmatched` flag and/or `no_category > 0` — shown on the card with a Notice badge, never on the marker (AC-23, AC-24; Flow US-08 → G2/G3) | NEW: SourceCard, NEW: Badge (notice) | wireframe 02-d |
| filling | `fill.status: continuing` — "Filling the last 30 days: reached <date>, next part <time>" (AC-19; Flow US-06 → K) | NEW: SourceCard | wireframe 02-c |
| fill limited | `fill.status: limited` — "First 30 days: reached <date>. Its allowed rate leaves no room to fill further." No next part (AC-19; review 2026-10-02, B12) | NEW: SourceCard | — |
| disabled | `state: disabled` — "Disabled in your settings. Its postings are kept." No next due (AC-26; Flow US-08 → G1) | NEW: SourceCard (muted), NEW: Badge (disabled) | wireframe 02-d |
| not verified | `state: not_verified` — "Enabled, not read until its limits are verified." Never flagged silent (AC-27) | NEW: SourceCard (muted), NEW: Badge (not verified) | wireframe 02-d |
| never collected | `last_success_at: null` and enabled — "Not collected yet", next due (AC-12 Given, AC-19) | NEW: SourceCard (compact) | wireframe 02-c |

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

02-d  default — healthy, flagged, possibly changed, category notice, disabled, not verified
+--------------------------------------+
| Source health                        |
| [          Collect now           ]   |  CollectNowAction (idle)
| +----------------------------------+ |
| | Jobicy                  Enabled  | |  healthy
| | Last success 40 min ago          | |
| | Last run: +4 new · 1 updated ·   | |
| |   0 closed · 0 held              | |
| | Next due in 20 min               | |
| | Reads 24 h: 23 · Fresh p90: 3.4 h| |
| +----------------------------------+ |
| | Remotive               Problem   | |  flagged
| | (!) Failed on the last 2 due     | |
| |     runs - the source did not    | |
| |     answer within 30 seconds.    | |
| | Last success 15 h ago · due now  | |
| +----------------------------------+ |
| | Himalayas              Problem   | |  possibly changed + category notice
| | (!) Would close 42% of its open  | |
| |     postings - closures held.    | |
| | Last run: +2 new · 0 closed ·    | |
| |   12 held                        | |
| | (i) Category "devops" matched    | |  notice — not on the marker
| |     nothing. 3 listings had no   | |
| |     category and were skipped.   | |
| +----------------------------------+ |
| | We Work Remotely      Disabled   | |  disabled (muted)
| | Disabled in your settings.       | |
| | Its postings are kept.           | |
| +----------------------------------+ |
+--------------------------------------+
  not verified variant of the last card:
| | We Work Remotely  Not verified   | |
| | Enabled, not read until its      | |
| | limits are verified.             | |

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

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| AppNav (shared, `components/`) | The inventory has only the App shell; two routes now need navigation (ADR-0002 router) | done |
| Button (shared) | No button primitive exists; the canon needs a disabled-with-spinner state for actions | done |
| InlineBanner (shared; variants error / warning / info) | The canon prescribes inline banners for errors and notices; nothing implements one yet | done |
| SkeletonRow (shared) | The canon prescribes skeleton rows for loading lists; nothing implements one yet | done |
| Badge (shared; tones enabled / problem / notice / disabled / not verified) | Short status labels on cards; no label primitive exists | done |
| ProblemMarker (feature: `features/source-health/`) | A danger-toned link block specific to this feature's marker rule; built from InlineBanner styling but owns its link and copy | done |
| SourceCard (feature) | One source's health — layout specific to source health; composes Badge and the flag list | done |
| RunProgress (feature) | Per-source outcome list of a run, polled; specific to this feature | done |
| CollectNowAction (feature) | Button + the answer banners of `collectNow` (02-g); wraps the mutation states | done |
