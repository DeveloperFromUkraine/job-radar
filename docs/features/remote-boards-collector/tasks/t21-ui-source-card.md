---
id: T21
title: "Build SourceCard in every per-source state"
layer: "ui"
deps: ["T20"]
blocks: ["T22"]
acs: ["AC-12", "AC-14", "AC-19", "AC-23", "AC-24", "AC-25", "AC-26"]
files_hint: ["apps/web/src/features/source-health/SourceCard.tsx", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "L"   # justified: seven ACs each define one card state; the card is one component and splitting it would split its states
# measured inlined lines: 125
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T21 — Build SourceCard in every per-source state

## Place in the sequence

- **Blocked by:** T20 — Set up query + router, the shared primitives and SCR-01 with the problem marker · **Blocks:** T22 — Build the SCR-02 page states and settings / interrupted-run banners · **Wave:** 1 (after T20).
- **Lane:** shares `docs/design-system.md` with T20; shares `docs/design-system.md` with T23 — serialized.

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

Shows each source's health at a glance on SCR-02.

## Inlined context

> | State | Trigger / condition | Components | Source-ref |
> |---|---|---|---|
> | healthy | enabled, `flags: []` — last success, last run added / updated / closed / held, next due, reads in the last 24 h, freshness p90 (AC-12, spec §6) | NEW: SourceCard, NEW: Badge (enabled) | wireframe 02-d |
> | flagged | a `failing`, `silent` or `overdue` flag — the reason in plain words (AC-03, AC-13; Flow US-04 → K) | NEW: SourceCard, NEW: Badge (problem), flag reason list | wireframe 02-d |
> | possibly changed | a `held_back` or `unknown_location` flag — the reason names the number; held closures shown as *held* (AC-14, AC-25; Flow US-04 → L) | NEW: SourceCard, NEW: Badge (problem) | wireframe 02-d |
> | category notice | a `category_unmatched` flag and/or `no_category > 0` — shown on the card, never on the marker (AC-23, AC-24; Flow US-08 → G2/G3) | NEW: SourceCard, NEW: Badge (notice) | wireframe 02-d |
> | filling | `fill.status: continuing` — "Filling the last 30 days: reached <date>, next part <time>" (AC-19; Flow US-06 → K) | NEW: SourceCard | wireframe 02-c |
> | disabled | `state: disabled` — "Disabled in your settings. Its postings are kept." No next due (AC-26; Flow US-08 → G1) | NEW: SourceCard (muted), NEW: Badge (disabled) | wireframe 02-d |
> | not verified | `state: not_verified` — "Enabled, not read until its limits are verified." Never flagged silent (AC-27) | NEW: SourceCard (muted), NEW: Badge (not verified) | wireframe 02-d |
> | never collected | `last_success_at: null` and enabled — "Not collected yet", next due (AC-12 Given, AC-19) | NEW: SourceCard (compact) | wireframe 02-c |
>
> — `screens.md §SCR-02, source card states, verbatim` · full text: [screens.md](../screens.md)

```text
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
```

— `screens.md §SCR-02, wireframe 02-d, verbatim` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Renders one `SourceHealthRow` from `GET /api/v1/collector/source-health`: `source_id, state, last_success_at, next_due_at, last_outcome{counts}, flags[{kind, reason, raised_at, raises_marker}], fill, reads, freshness`.

— `contracts/openapi.yaml, schema SourceHealthRow, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

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

### AC-14 — domain invariant

> **Given** a source lists at least 10 open postings, and a single run of it would actually close (after AC-09) more than 30% of them
> **When** the collection run finishes
> **Then** those closures are held back (the postings stay open), and the source is flagged as possibly changed so the owner can check it; the next run of that source re-checks them by itself — at or under 30% they close, otherwise they stay held and the flag stays
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy

> **Given** an enabled source has never been read — on the app's first start, or when a source is enabled for the first time later
> **When** that source is first collected
> **Then** it collects, newest first, as much of the last 30 days as the source offers (Jobicy offers only 7) and its allowed rate leaves after the regular reads — regular reads always come first — and the owner sees its first postings without waiting for the schedule
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — happy

> **Given** the owner's tech category list, kept in their settings file, does not include a source's category
> **When** that source offers a listing in it
> **Then** the listing is not collected — a listing in several categories is collected if at least one is on the list; a listing with no category is not collected and is counted in source health; postings already collected under a category the owner later removes stay and age out as usual
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

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

### AC-26 — happy

> **Given** a source is disabled in the owner's settings file
> **When** any collection run starts — scheduled, catch-up or collect-now
> **Then** that source is not read, its existing postings are neither closed nor removed because of it (the AC-10 clock is paused while all of a posting's sources are disabled), its listings no longer count toward closing (AC-07), and source health shows it as disabled
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] SourceCard composing Badge + flag reason list; phone = stacked card, `lg:` table-row variant — `src/features/source-health/SourceCard.tsx`
- [ ] Relative times with exact local time in `title`; source name links to the source site — `SourceCard.tsx`
- [ ] Register SourceCard in the inventory — `docs/design-system.md`
- [ ] Tests per state — `SourceCard.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Reason text contains `<b>` | Rendered as text |
| `next_due_at` null and disabled | No next-due line |
| Several flags | All reasons listed |

## Definition of Done

- [ ] SourceCard tests pass for all eight states
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
