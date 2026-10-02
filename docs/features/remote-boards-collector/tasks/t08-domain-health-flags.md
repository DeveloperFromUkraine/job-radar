---
id: T8
title: "Implement the source health flags, overdue and the marker rule"
layer: "domain"
deps: ["T3"]
blocks: ["T15", "T18"]
acs: ["AC-13", "AC-24", "AC-25"]
files_hint: ["apps/server/src/modules/collector/domain/health.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 56
status: "done"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T8 — Implement the source health flags, overdue and the marker rule

## Place in the sequence

- **Blocked by:** T3 — Model the source registry, due-ness and rolling-window rate limits · **Blocks:** T15 — Finalize a run: apply closures, hold-back, flags and per-source counts, T18 — Serve getCollectorProblems and getSourceHealth · **Wave:** 1 (after T3).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to see each source's health and have problems flagged in plain words
> **So that** a broken source never silently shrinks what I see
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to choose, in a settings file on my machine, which sources are enabled and which of their job categories count as tech
> **So that** the collection holds only roles I could want and I can adjust when a board changes its categories
>
> > **Visitor:** no user story — a visitor has no goal this feature serves; the role exists only to be kept out, covered by AC-17 and §6.1.
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Makes every way a source can silently cost postings visible as a flag with a plain reason.

## Inlined context

> **Hard rule:**
>
> | Aspect | Target | Measurement |
> |---|---|---|
> | Problem detection | a failing or silent source flagged within 2 of its own intervals | AC-13 / AC-14 / AC-25 tests; time from first failure to flag, from run history |
>
> — `spec.md §6, Problem detection, verbatim` · full text: [spec.md](../spec.md)

> Covers AC-07, AC-08, AC-09, AC-12, AC-13, AC-14, AC-24, AC-25 and the closing half of AC-26 (ADR-0004). Runs once, after every due source has finished Flow 5; an interrupted run never gets here (Flow 3). The overdue flag is the one rule that can rise without any run, so it is evaluated when source health is read (Flow 10), not here.
>
> — `sad.md §6, Flow 7 intro, verbatim` · full text: [sad.md](../sad.md)

> - **Decisions taken in this pass (below the ADR threshold):** a partial fetch counts as a successful read for last success, overdue and catch-up (Flow 5); overdue is evaluated when source health is read, so it needs a record of when the app was running (Flow 7, Flow 10); a refused first-fill page ends that part of the fill without a failing flag (Flow 8); if the marks port fails, clean-up removes nothing that day (Flow 9).
>
> — `sad.md §6 Notes, decisions taken in sequences, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-13 — error

> **Given** a source has failed on two consecutive due runs, returned zero items (not merely zero new ones) on two consecutive due runs, or has not been read for more than twice its interval while the app was running
> **When** the owner opens the app
> **Then** that source is flagged with a plain-language reason in source health, the app's main screen shows that a source has a problem, and the flag clears by itself after the source's next successful read that returns items
>
> > Main-screen marker — shown while any flag that can cost the owner postings is up: failing / silent / overdue (AC-13, clears after the next successful read that returns items), closures held back (AC-14, clears when the next run of that source is at or under 30%), unusual unknown-location share (AC-25, clears when that source's next run is back under the threshold), unreadable settings file (AC-27, clears after the next valid read). Shown only in source health, without the marker: a category that matched nothing (AC-24) and defaults in use (AC-27). There is no in-app control to accept held closures in v1.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — error

> **Given** the owner's tech category list names a category that is missing from the source's published category list — or, for a source that publishes none, that matched no listing in the last 7 days
> **When** the source is collected
> **Then** source health tells the owner that this category matched nothing at the source, so they can update the list
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

### AC-25 — domain invariant

> **Given** the source has at least 7 days of collected history, and in a single run more than half of its new listings have an unknown location restriction, and that share is at least twice the source's average share over the previous 7 days
> **When** the collection run finishes
> **Then** the listings are collected as usual and the source is flagged as possibly changed, with the unusual share named in the reason
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `failing` — failed on 2 consecutive due runs; `silent` — zero items (not zero new) on 2 consecutive due runs — `domain/health.ts`
- [ ] `overdue(lastReadAt, interval, sessions, now)` — time inside app sessions since the last read > 2 × interval; never for disabled / not_verified — `domain/health.ts`
- [ ] `unknownLocation` — ≥7 days of history, >50% of new listings unknown and ≥2× the previous 7 days' average share; reason names the share — `domain/health.ts`
- [ ] `categoryUnmatched` — category missing from the source's published list, or (no list) matched nothing in 7 days — `domain/health.ts`
- [ ] `raisesMarker(kind)` false only for `category_unmatched`; plain-language reason texts — `domain/health.ts`
- [ ] Unit tests with a fake clock — `domain/health.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Partial fetch (limit used up) | Not a failure for `failing` |
| Zero new but items returned | Not silent |
| Laptop asleep for 10 h | Not overdue — outside any session |
| We Work Remotely enabled, rate 0 | Never silent / overdue |
| Source with 6 days of history | No unknown-location flag |
| Next successful read returns items | failing / silent / overdue clear |

## Definition of Done

- [ ] health-flag unit tests pass at and around every threshold
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
