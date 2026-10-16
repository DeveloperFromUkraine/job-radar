---
id: T03
title: "Write the signal and penalty rules: age basis, many boards, repost, no salary, cap 30"
layer: "domain"
deps: []
blocks: ["T08"]
acs: ["AC-01", "AC-02", "AC-07", "AC-08", "AC-09"]
files_hint: ["apps/server/src/modules/realness/domain/signals.ts", "apps/server/src/modules/realness/domain/signals.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T03 — Write the signal and penalty rules: age basis, many boards, repost, no salary, cap 30

## Place in the sequence

- **Blocked by:** nothing — can start at once · **Blocks:** T08 — Implement assess(): work out penalty and signals for a set of postings with switch-on rules · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** owner
> **I want** each lowered posting to name every signal behind its penalty
> **So that** I can check the reason on the board and decide for myself
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task turns a posting's stored facts into its penalty and the exact list of signals the card names, so the reason line always matches the points behind it.

## Inlined context

> **Penalty rule (spec AC-01, fixed here for `tasks`):** age from `min(publishedAt, firstFoundAt)` (search's effective time) in calendar days of the machine's time zone: 30–59 days → 10, ≥ 60 → 20. Many boards: ≥ 3 enabled sources with an open listing and first found ≥ 45 days ago → 15. Only the larger of age and many boards counts. Repost → 10. No stated salary → 5. Total capped at 30. Ordering: scored postings by `total − penalty` descending, and unscored postings with penalty 0 first, then by penalty ascending. Ties keep newest first (the sort is stable). With realness off, every penalty is 0.
>
> — `sad.md §4, Penalty rule, verbatim` · full text: [sad.md](../sad.md)

> **Signal definitions (spec AC-06 – AC-09):**
> - *Age basis* — "posted" when `publishedAt` is set and not later than `firstFoundAt`; otherwise "first found" (first fill without a publication time, or a publication time later than first found).
> - *Many boards* — distinct **enabled** sources (`collector/app/location.ts` `enabledSourceIds`) with an open listing for the posting.
> - *Repost* — the posting has `reopenedAt` (a reopening since this shipped); or a **closed**, not-removed earlier posting has the same `lookAlikeKey(company, title)` and an effective time more than 7 days before this one's. An earlier match that is still open means parallel hires: neither gets the signal.
> - *No salary* — none of the posting's open listings from enabled sources states pay. A listing states pay when its pay field or its title or description holds an amount of money as pay (the amount parser). It also counts as stating pay when its pay field is NULL (not read since this shipped) and its source has a pay field.
>
> — `sad.md §4, Signal definitions, verbatim` · full text: [sad.md](../sad.md)

> | Time | Calendar days in the machine's time zone (`machineTimeZone()`), for the thresholds, the "N days ago" number and the daily share's day | `core/config.ts` |
>
> — `sad.md §8, Time row, verbatim` · full text: [sad.md](../sad.md)

> A posting's publication time, never later than when job-radar first found it; the time newest first orders by and age counts from (search `order.ts`)
>
> — `sad.md §12, Effective time, verbatim` · full text: [sad.md](../sad.md)

> RealnessSignal (oneOf):
>   age:          { kind: "age", basis: "posted" | "first_found", days: integer ≥ 30 }
>   many_boards:  { kind: "many_boards", boards: integer ≥ 3, days: integer ≥ 45 }   # days since first found
>   repost:       { kind: "repost" }
>   no_salary:    { kind: "no_salary" }
> Realness: { penalty: integer 1–30, signals: RealnessSignal[1..3] }
>   signals order: age or many boards, repost, no salary (AC-02)
>
> — `contracts/openapi.yaml, components.schemas RealnessSignal + Realness, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (The output shape is the contract's `Realness` object, inlined above.)

## Acceptance criteria

### AC-01 — happy

> **Given** realness is on, the owner's list is in best match first, and it holds posting A with match score 88 and no signals, posting B with match score 92, posted 65 days ago and stating no salary, and posting C with match score 70 and no signals
> **When** the owner opens the list
> **Then** they see A (88), then C (70), then B (92 minus 25 is 67); each card still shows its own match score, A 88, C 70 and B 92; postings with an equal score after the penalty keep their newest-first order
>
> > Penalty points: posted or first found 30–59 days ago 10; 60 or more days ago 20; open at three or more enabled sources and first found 45 or more days ago 15 (the larger of this and age counts, not both); reposted 10; no stated salary 5. The total is capped at 30. "N days ago" counts calendar days in the owner's time zone between the time and today, for both the thresholds and the number on the card.
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — happy

> **Given** realness is on and a posting in the owner's list was reposted, states no salary and was first found 47 days ago, with no publication time from its sources
> **When** the owner sees its card, in either order
> **Then** the card shows one line naming every signal behind the penalty, for example "Lowered: first found 47 days ago · reposted · no salary listed" in best match first, and the same signals as "Signals: …" in newest first, where nothing was lowered; an age says "posted N days ago" only when the time it counts from is the publication time (AC-07), and "first found N days ago" otherwise, including when a source gives a publication time later than when job-radar first found the posting; a long life on many boards says "on 4 boards · first found 50 days ago"; when both time signals apply, the line names only the one that counts (AC-01); a posting with no signal shows no line
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a posting whose age is worked out from its time as search orders it — its publication time, but never later than when job-radar first found it — including postings collected in the collector's first fill
> **When** that time is 30 days ago or more
> **Then** it has the age signal; a posting collected in the first fill with no publication time counts from when it was first found and its reason says "first found N days ago", never "posted"; so does a posting whose publication time is later than when it was first found; a posting reopened by the collector keeps the time search orders it by, and also has the repost signal (AC-08)
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — cross-context

> **Given** the collector reopened a posting after it had closed (a reopening since this shipped), or the owner's collection holds an earlier, closed posting (marked or not) that matches this posting by the look-alike matching rule (company and title as in CONTEXT "Look-alike posting", applied here to any earlier posting, not only a marked one), whose time as search orders it (publication time, never later than first found) is more than 7 days before this posting's
> **When** job-radar works out the posting's realness signals
> **Then** it has the repost signal; a posting merged from listings within 7 days of each other (collector AC-04) is one posting and is not a repost; two copies collected on the same day in the first fill, published more than 7 days apart, are a repost; a posting whose earlier copy was already removed by clean-up has no repost signal; while the earlier matching posting is still open, the two are read as parallel hires and neither has the repost signal; a look-alike posting keeps its look-alike hint (applied-skipped) next to the reason line
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — cross-context

> **Given** a posting is open at four sources and was first found 50 days ago, and one of those sources is then disabled by the owner
> **When** the owner next loads the list
> **Then** only listings still offered by enabled sources count toward "on N boards", so it reads "on 3 boards · first found 50 days ago" and keeps that signal; with two enabled sources left it has only the age signal; a change the collector makes to a posting (a new listing, a reopening, new text stating pay) changes its signals from the next time the list is loaded or refreshed
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Export a calendar-day count `daysAgo(time, now, timeZone)` (whole calendar days in the zone, not 24 h spans); reuse the calendar-day helper tracking's `domain/grace.ts` uses if it is exported, else `Intl.DateTimeFormat` — `realness/domain/signals.ts`
- [ ] Export `repostByLookAlike(posting, sameKey[])`: true when a **closed** same-key posting's effective time is > 7 days before this one's and no earlier same-key posting is still open; the caller passes same-key postings (keying stays in the app)
- [ ] Export `realnessOf(facts, now, timeZone)` → `{ penalty, signals }` where facts = `{ publishedAt, firstFoundAt, enabledOpenBoards, reopened, repostByLookAlike, noSalary }`; signals ordered age-or-many-boards, repost, no salary; only the larger of age and many boards is listed; `penalty = min(30, …)`
- [ ] Keep the thresholds and points as named constants (sad §11: revisit after the §7 hand check)
- [ ] Table-driven tests for every edge in the Edge cases table — `signals.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Effective time 29 vs 30 days ago; 59 vs 60 | no age signal vs 10; 10 vs 20 |
| 3 enabled boards, first found 44 vs 45 days ago | no many-boards signal vs 15 |
| Age 20 and many boards 15 both apply | only age is listed and counted |
| Age 10 and many boards 15 both apply | only many boards is listed and counted |
| `publishedAt` null, or later than `firstFoundAt` | `basis: first_found`, days from first found |
| Age 20 + repost 10 + no salary 5 | penalty 30 (cap), all three signals listed |
| Earlier closed look-alike exactly 7 days earlier | no repost (needs more than 7 days) |
| Earlier look-alike still open | parallel hires — no repost from the look-alike rule |
| Two first-fill copies found the same day, published > 7 days apart, earlier one closed | repost |
| No signal | `penalty: 0`, `signals: []` |

## Definition of Done

- [ ] every edge in the table has a passing test
- [ ] `signals.ts` is pure: no I/O, no clock read (now and zone are arguments)
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
