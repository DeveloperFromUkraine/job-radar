---
id: T7
title: "Implement listing closures per source verdict and the 30% hold-back"
layer: "domain"
deps: ["T5"]
blocks: ["T15"]
acs: ["AC-07", "AC-08", "AC-09", "AC-14", "AC-26"]
files_hint: ["apps/server/src/modules/collector/domain/closures.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 69
status: "done"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T7 — Implement listing closures per source verdict and the 30% hold-back

## Place in the sequence

- **Blocked by:** T5 — Define the adapter contract and normalize listings (plain text, location as stated, category filter) · **Blocks:** T15 — Finalize a run: apply closures, hold-back, flags and per-source counts · **Wave:** 1 (after T5).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** postings that are really closed to be hidden, and old untouched ones to be cleared away
> **So that** I only spend time on roles I can still apply to, without losing my own marks
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

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

Decides which postings may close after a run — the rule behind the false-closure KPI.

## Inlined context

> | Source | Completeness | Closing signal | Never closes on |
> |---|---|---|---|
> | Remotive | `complete` when the single unfiltered request succeeded — one read per run, inside ≤ 4 a day | listing absent from that complete fetch | failed or partial fetch |
> | Himalayas | `capped` (≤ 20 per request, ≤ 4 requests a day) | `expiryDate` in the past | absence |
> | Jobicy | `complete` within the window when the response has fewer items than requested, else `capped` | absent from a complete response and published after (now − 7 days + 12 h) | a listing older than the window; a capped response |
> | We Work Remotely | — (disabled) | none — ages out only (AC-10) | anything |
>
> — `adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md §Decision outcome, per-source table, verbatim` · full text: [0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md](../adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md)

> **Run phases.** A collection run has two phases. *Ingest* — per due source, in turn: record the read in the ledger, fetch, then in one transaction store or update its listings, merge them into postings, record the source's outcome and, when the fetch finished, its last success; this is kept even if the run is later interrupted (AC-20). *Finalize* — after every due source is done: apply the listing closures each source's verdict allows (ADR-0004), hold back a source's closures when they exceed 30% of its open postings (AC-14), close postings whose every listing is closed (AC-07, AC-09), compute health flags (AC-13, AC-25) and mark the run finished. An interrupted run never reaches finalize, so nothing is closed on its basis.
>
> — `sad.md §6, Run phases, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-07 — happy

> **Given** every enabled source listing a posting has confirmed it is no longer open — a disabled source's listing does not count, and at least one enabled source must have confirmed
> **When** the collection run records that
> **Then** the posting is marked closed, hidden from the owner's open postings, and any applied or skipped mark on it is kept
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a listing is missing from a source's fetch that failed, was cut short, or only covers that source's most recent items
> **When** the collection run finishes
> **Then** the posting stays open — a failed or partial fetch never closes a posting
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a posting is listed by two sources and only one of them confirms it closed
> **When** the collection run records that
> **Then** the posting stays open and keeps the still-open source's link
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — domain invariant

> **Given** a source lists at least 10 open postings, and a single run of it would actually close (after AC-09) more than 30% of them
> **When** the collection run finishes
> **Then** those closures are held back (the postings stay open), and the source is flagged as possibly changed so the owner can check it; the next run of that source re-checks them by itself — at or under 30% they close, otherwise they stay held and the flag stays
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — happy

> **Given** a source is disabled in the owner's settings file
> **When** any collection run starts — scheduled, catch-up or collect-now
> **Then** that source is not read, its existing postings are neither closed nor removed because of it (the AC-10 clock is paused while all of a posting's sources are disabled), its listings no longer count toward closing (AC-07), and source health shows it as disabled
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `listingClosures(source, completeness, seenInRun, openListings, now)` per the ADR-0004 table (Remotive absence on complete; Himalayas `expiryDate`; Jobicy absence within the window after now − 7 days + 12 h) — `domain/closures.ts`
- [ ] `postingsToClose(postings)` — every enabled source's listing closed and ≥1 enabled source confirmed; disabled sources' listings ignored — `domain/closures.ts`
- [ ] `holdBack(openCount, wouldClose)` — ≥10 open and >30% → hold all of that source's closures — `domain/closures.ts`
- [ ] Credit each closure to the source that gave the last confirmation; held closures counted as `held` — `domain/closures.ts`
- [ ] Unit tests from recorded verdict shapes — `domain/closures.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Fetch failed or partial | No closures from that source |
| Himalayas capped, no expired item | No closures |
| Jobicy listing older than its window | Never closed by absence — ages out (AC-10) |
| Only a disabled source lists the posting | Never closes |
| Exactly 30% would close | Closes |
| 9 open postings, 5 would close | Closes (hold-back needs ≥10) |

## Definition of Done

- [ ] closure and hold-back unit tests pass for every source shape
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
