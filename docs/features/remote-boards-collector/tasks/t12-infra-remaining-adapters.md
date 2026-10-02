---
id: T12
title: "Verify spec §8 Q1/Q3, then build the Remotive, Himalayas and We Work Remotely adapters"
layer: "infra"
deps: ["T11"]
blocks: ["T24"]
acs: ["AC-01", "AC-03", "AC-21", "AC-22"]
files_hint: ["apps/server/src/modules/collector/infra/sources/remotive.ts", "apps/server/src/modules/collector/infra/sources/himalayas.ts", "apps/server/src/modules/collector/infra/sources/weworkremotely.ts", "apps/server/src/modules/collector/domain/sources.ts", "apps/server/test/fixtures/sources/", "docs/features/remote-boards-collector/spec.md"]
owner: "Volodymyr Kozlov"
estimate: "L"
context_budget: "M"
# measured inlined lines: 64
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Verify spec §8 Q1/Q3, then build the Remotive, Himalayas and We Work Remotely adapters

## Place in the sequence

- **Blocked by:** T11 — Build the ledgered HTTP client and the Jobicy adapter · **Blocks:** T24 — Prove limits, interruption and start-up end to end against a fake source server · **Wave:** 2 (after T11).
- **Lane:** shares `apps/server/src/modules/collector/domain/sources.ts` with T3 — serialized.

## Why (user story)

> **As an** owner
> **I want** new remote tech postings collected from every enabled source on that source's own schedule
> **So that** I never have to open the boards to see what is new
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** each source's location restriction kept exactly as the source stated it, with "unknown" when it states nothing
> **So that** the later remote filter never mistakes a missing restriction for "work from anywhere"
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Completes source coverage behind the one adapter contract.

## Inlined context

> - [ ] What are We Work Remotely's rate limits, and does its feed state a location restriction? Default now: WWR stays disabled until verified (AC-26). Its terms page could not be read during design (2026-10-02). — owner: Volodymyr Kozlov, due: before the adapters task (T12) in `sdd:implement` (moved from before `sdd:design`, then from before `sdd:tasks` on 2026-10-02 — the design absorbs either answer)
> - [ ] What is Himalayas' actual allowed polling rate given its documented 24-hour cache? Default now: every 6 hours, ≤ 4 reads a day. Its docs (checked 2026-10-02) say only that polling more than once a day brings no benefit and cap requests at 20 records — no numeric limit. — owner: Volodymyr Kozlov, due: before the adapters task (T12) in `sdd:implement` (moved from before `sdd:design`, then from before `sdd:tasks` on 2026-10-02 — the design absorbs either answer)
>
> — `spec.md §8, Q1 + Q3, verbatim` · full text: [spec.md](../spec.md)

> | Source | Completeness | Closing signal | Never closes on |
> |---|---|---|---|
> | Remotive | `complete` when the single unfiltered request succeeded — one read per run, inside ≤ 4 a day | listing absent from that complete fetch | failed or partial fetch |
> | Himalayas | `capped` (≤ 20 per request, ≤ 4 requests a day) | `expiryDate` in the past | absence |
> | We Work Remotely | — (disabled) | none — ages out only (AC-10) | anything |
>
> — `adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md §Decision outcome, Remotive / Himalayas / We Work Remotely rows, abridged` · full text: [0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md](../adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md)

> **Hard rule:**
>
> | Risk / debt | Severity | Mitigation | Owner |
> |---|---|---|---|
> | Himalayas yields at most 80 listings a day (≤ 20 per request × ≤ 4 reads a day), which may miss tech postings and threaten the ≥ 95% completeness KPI | High | Use Himalayas' filtered search (tech categories, newest first) so every read counts; measure the per-source baseline in the first 7 days (spec §7); spec §8 Q3 to verify the real allowed rate | Volodymyr Kozlov |
> | Remotive is read with one unfiltered request per run; the full active-listings response (HTML descriptions included) may approach the 10 MB response cap (§8) | Medium | Measure the real response size in the first adapter task; raise the cap for Remotive or fall back to one category request per run if needed | Tech Lead |
>
> — `sad.md §11, Himalayas yield + Remotive size, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy

> **Given** an enabled source is due and offers a new listing in one of the owner's tech categories
> **When** the collection run reads that source
> **Then** a new posting appears in the owner's collection with its title, company, publication time, the source's name and a link back to the source
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** one enabled source cannot be reached, refuses the request, or returns something that cannot be read
> **When** the collection run reads it
> **Then** the other sources are still collected, no posting from the failing source is closed, and that source's health shows the failure with a plain-language reason
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — happy

> **Given** a source states where candidates may work from — as countries, regions, time zones or free text
> **When** its listing is collected
> **Then** the posting keeps that statement exactly as the source gave it, named after the source; when the source later changes the listing, the latest statement replaces the stored one (no history is kept), and earlier merges are not re-decided
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — domain invariant

> **Given** a source states nothing about where candidates may work from
> **When** its listing is collected
> **Then** the posting's location restriction is recorded as unknown, never as "anywhere"
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] First: check Q1 (We Work Remotely limits + location data) and Q3 (Himalayas' rate); update spec §8 and the registry constants in `domain/sources.ts`, or re-defer with a new date — `spec.md`, `domain/sources.ts`
- [ ] Remotive: one unfiltered request per run, `complete` on success; measure the real size against the 10 MB cap — `infra/sources/remotive.ts`
- [ ] Himalayas: filtered search, tech categories, newest first, ≤20 per request, `capped`; `expiryDate` → close signal — `infra/sources/himalayas.ts`
- [ ] We Work Remotely: adapter stub with attribution; never called while the rate is 0 — `infra/sources/weworkremotely.ts`
- [ ] Recorded fixtures per source — `apps/server/test/fixtures/sources/<source>/`

## Edge cases

| Case | Behaviour |
|---|---|
| Himalayas item without `expiryDate` | No close signal |
| Remotive response near 10 MB | Raise the cap for Remotive or switch to one category request per run (sad §11) |
| Q1/Q3 still unanswered | Keep defaults, re-defer with owner + date in spec §8 |

## Definition of Done

- [ ] Remotive and Himalayas adapter tests pass on recorded fixtures
- [ ] We Work Remotely never fetched at rate 0 (test)
- [ ] spec §8 Q1/Q3 updated
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
