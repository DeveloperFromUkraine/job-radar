---
id: T9
title: "Implement the retention clock and the once-a-day clean-up rule"
layer: "domain"
deps: []
blocks: ["T17"]
acs: ["AC-10", "AC-26"]
files_hint: ["apps/server/src/modules/collector/domain/retention.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
# measured inlined lines: 45
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T9 — Implement the retention clock and the once-a-day clean-up rule

## Place in the sequence

- **Blocked by:** nothing — starts in wave 0 · **Blocks:** T17 — Run the daily clean-up through the MarkedPostings port · **Wave:** 0 (no prerequisites).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** postings that are really closed to be hidden, and old untouched ones to be cleared away
> **So that** I only spend time on roles I can still apply to, without losing my own marks
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to choose, in a settings file on my machine, which sources are enabled and which of their job categories count as tech
> **So that** the collection holds only roles I could want and I can adjust when a board changes its categories
>
> > **Visitor:** no user story — a visitor has no goal this feature serves; the role exists only to be kept out, covered by AC-17 and §6.1.
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Decides which untouched postings age out and when the daily clean-up may run.

## Inlined context

> **Hard rule:**
>
> | Aspect | Target | Measurement |
> |---|---|---|
> | Retention bound | unmarked postings more than 60 days past closing or past the last offer from an enabled source (disabled-only days not counted, AC-10) removed on every daily clean-up | count of such unmarked postings = 0 after clean-up |
>
> — `spec.md §6, Retention bound, verbatim` · full text: [spec.md](../spec.md)

> Covers AC-10 and the retention-clock half of AC-26 (ADR-0006). Started by Flow 7 after the day's first run that finished without being interrupted, even if a source in it failed. Owner marks live outside the collector, so the collector asks the marks port before removing anything; until roadmap step 6 the port answers "none".
>
> — `sad.md §6, Flow 9 intro, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-10 — happy

> **Given** more than 60 days have passed since a posting closed, or since any enabled source last offered it — days on which all of its sources were disabled do not count
> **When** clean-up runs (once a day, after the day's first collection run that finished without being interrupted — even if a source in it failed; the day is the calendar day in the owner's machine time zone)
> **Then** the posting is removed if the owner never marked it, and kept if the owner marked it applied or skipped
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — happy

> **Given** a source is disabled in the owner's settings file
> **When** any collection run starts — scheduled, catch-up or collect-now
> **Then** that source is not read, its existing postings are neither closed nor removed because of it (the AC-10 clock is paused while all of a posting's sources are disabled), its listings no longer count toward closing (AC-07), and source health shows it as disabled
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `countedAge(posting, disabledPeriodsPerSource, now)` — from `closed_at` if closed, else `last_offered_at`; subtract time when every one of its sources was disabled — `domain/retention.ts`
- [ ] `isPastRetention(age)` — more than 60 days — `domain/retention.ts`
- [ ] `cleanupDue(lastCleanupOn, runFinishedAt, timeZone)` — first finished, not interrupted run of the calendar day — `domain/retention.ts`
- [ ] Unit tests incl. a DST change day — `domain/retention.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| One of two sources disabled | Clock keeps running |
| All sources disabled for 10 days | Those 10 days not counted |
| Clean-up already ran today | Not due |
| Run finished at 23:59 then 00:01 local | Two different days |

## Definition of Done

- [ ] retention and clean-up-due unit tests pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
