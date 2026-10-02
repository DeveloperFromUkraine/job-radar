---
id: T3
title: "Model the source registry, due-ness and rolling-window rate limits"
layer: "domain"
deps: []
blocks: ["T8", "T11", "T13"]
acs: ["AC-02"]
files_hint: ["apps/server/src/modules/collector/domain/sources.ts", "apps/server/src/modules/collector/domain/schedule.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
# measured inlined lines: 39
status: "done"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T3 — Model the source registry, due-ness and rolling-window rate limits

## Place in the sequence

- **Blocked by:** nothing — starts in wave 0 · **Blocks:** T8 — Implement the source health flags, overdue and the marker rule, T11 — Build the ledgered HTTP client and the Jobicy adapter, T13 — Run the one-minute scheduler, start-up recovery and run opening · **Wave:** 0 (no prerequisites).
- **Lane:** shares `apps/server/src/modules/collector/domain/sources.ts` with T12 — serialized.

## Why (user story)

> **As an** owner
> **I want** new remote tech postings collected from every enabled source on that source's own schedule
> **So that** I never have to open the boards to see what is new
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Encodes when each source may be read — the one rule scheduled, catch-up and collect-now runs share.

## Inlined context

> **Hard rule:**
>
> | Aspect | Target | Measurement |
> |---|---|---|
> | Source request rate | never above each source's published limit (Jobicy ≤ 1 per hour; Remotive ≤ 4 per day and ≤ 2 per minute; Himalayas ≤ 4 per day until §8 Q3 sets its verified rate; We Work Remotely 0 — not read until §8 Q1 sets its verified limit). One read = one request to the source, pages and failed requests included; "per hour" / "per day" are rolling 60-minute / 24-hour windows; a retry happens only within the limit. A source may be read only once its interval has passed since its last read — scheduled, catch-up and collect-now alike; intervals are set so one read per interval stays inside the limit. If the limit is used up during a fetch, that fetch counts as partial (nothing is closed on its basis) and is not a failure for AC-13. Intervals: Jobicy 1 h, Remotive 6 h, Himalayas 6 h | count of reads per source per rolling window, checked in tests and visible in source health |
>
> — `spec.md §6, Source request rate, verbatim` · full text: [spec.md](../spec.md)

> **Chosen:** Option 1. Persisting every request before it is sent makes the rolling-window limit hold across sleep, crash and restart and counts pages and failed requests (option 2 cannot: one timestamp per source does not count a multi-page Himalayas fill or a failed request inside a rolling 24-hour window, spec §6); a due-check needs no special path for catch-up or sleep; a queue library (option 3) would still need our own rolling-window and one-run-for-all-sources rules on top of its own tables.
>
> - "Due" means the source's interval has passed since its last read, for scheduled, catch-up and collect-now alike; the first fill only uses the budget left after regular reads, and a limit used up mid-fetch makes that fetch partial, not a failure (spec AC-02, AC-15, AC-19, §6, clarified 2026-10-02).
>
> — `adr/0003-drive-collection-from-a-one-minute-due-check-over-persisted-state.md §Decision outcome, Chosen + Neutral, verbatim` · full text: [0003-drive-collection-from-a-one-minute-due-check-over-persisted-state.md](../adr/0003-drive-collection-from-a-one-minute-due-check-over-persisted-state.md)

> | Concept | Convention | Where defined |
> |---|---|---|
> | Time | Stored as UTC epoch milliseconds; source publication times kept as the source states them, converted to UTC; the clock is injected so rate windows, due-ness, flags and retention are tested with a fake clock | here |
>
> — `sad.md §8, Time, verbatim` · full text: [sad.md](../sad.md)

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

## Checklist

- [ ] `SourceId` + registry: name, site URL, interval (Jobicy 1 h, Remotive 6 h, Himalayas 6 h), limits per rolling window, allowed rate 0 for We Work Remotely — `domain/sources.ts`
- [ ] `isDue(lastReadAt, interval, now)` — due once the interval has passed since the last read; never-read is due — `domain/schedule.ts`
- [ ] `windowAllows(readTimes, limits, now)` over rolling 60-minute / 24-hour (and Remotive's per-minute) windows — `domain/schedule.ts`
- [ ] `nextDueAt(lastReadAt, interval)`; null for allowed rate 0 — `domain/schedule.ts`
- [ ] Unit tests with an injected clock: 7 days, collect-now every minute, restarts, interrupted runs → reads per window ≤ limit — `domain/schedule.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Never read (`last_read_at` null) | Due now |
| Read exactly one interval ago | Due |
| Allowed rate 0 (We Work Remotely) | Never due, regardless of `enabled` |
| Window used up mid-fetch | `windowAllows` false → caller ends the fetch as `partial`, not `failed` |
| Crash after a read was recorded but before it was sent | Still counts — reads are counted from the ledger |

## Definition of Done

- [ ] unit tests for due-ness, next-due and every window pass with a fake clock
- [ ] 7-day property test never exceeds a limit
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
