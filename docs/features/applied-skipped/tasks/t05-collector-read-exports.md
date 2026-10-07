---
id: T05
title: "Add the collector's read-only exports: postings by id including closed, and the retention outlook"
layer: "app"
deps: []
blocks: ["T07", "T09"]
acs: ["AC-05", "AC-07"]
files_hint: ["apps/server/src/modules/collector/app/open-postings.ts", "apps/server/src/modules/collector/infra/repo/open-postings.ts", "apps/server/src/modules/collector/app/retention-outlook.ts", "apps/server/test/collector-read-exports.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T05 — Add the collector's read-only exports: postings by id including closed, and the retention outlook

## Place in the sequence

- **Blocked by:** — · **Blocks:** T07 — Implement the mark, change, clear and undo use cases with their error mapping and MarkState, T09 — Implement tracking's read queries for search: marked ids, the marked order, and look-alike hints · **Wave:** 1 (no deps, starts at once).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to see the postings I marked, including closed ones, and change or clear a mark
> **So that** I can find a role I applied to when a recruiter replies, and fix a decision I regret
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Gives tracking and search the closed postings and clean-up dates the marked view and the at-risk warning need.

## Inlined context

> `open-postings.ts` + postings by id including closed ones (sources named, links only for open listings)
> `retention-outlook.ts` NEW read-only: per posting, past 60 counted days? and the date clean-up will remove it
>
> — `sad.md §5, Internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> "Removed after" date, at-risk flag (AC-07) — `collector/app/retention-outlook.ts` (`closed_at`, `last_offered_at`, disabled periods) — Later of the grace-day end and the retention date
>
> — `data-model.md §Read from the collector, abridged` · full text: [data-model.md](../data-model.md)

> **Code fact:** `collector/app/cleanup.ts` computes eligibility with `countedAgeMs(p, perSource, now)` + `isPastRetention` from `collector/domain/retention.ts`, over `retentionCandidates` and `readDisabledPeriods`; `cleanupDay` lives in the same domain file. The outlook must reuse these, never re-derive the 60-day rule.
>
> — `apps/server/src/modules/collector/app/cleanup.ts:19-27, abridged`

> **Hard rule:** Postings and listings, their open/closed state, merging and clean-up belong to the collector (collector ADR-0005). The ordered list and its snapshots belong to search (search ADR-0003). This feature reads both through their `app/` exports and never writes collector tables.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

> AC-09 limit: more than 60 days since closing, or since any enabled source last offered it, with days when all its sources were disabled not counted.
>
> — `spec.md §5, AC-09 Given, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Reads `collector_postings` (`status`, `closed_at`, `last_offered_at`), `collector_listings` and disabled periods — read-only.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-05 — happy

> **Given** the owner has marked postings, some of which have since closed, and has cleared the marks of some closed postings (AC-07)
> **When** the owner turns on "Show marked postings"
> **Then** the list shows only marked postings, most recently marked first, each with its mark and the date it was set, and with the number of marked postings. Closed postings whose mark the owner cleared and that clean-up has not yet removed are shown too, labelled "Cleared, removed after <date>" with the applied and skipped actions, and counted separately ("and N cleared"). The owner's skills narrow the view as they narrow the main list. A closed posting is labelled "Closed" and names every source, with links only for listings still open. The order and the pages are fixed when the view loads, as for the main list (AC-12): a card whose mark the owner changes stays in place until the view is refreshed, and later pages never repeat or skip a posting. The switch starts off on every visit, and turning it off returns to the unmarked list.
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a posting marked applied that clean-up would remove if it were not applied (it is past the collector's 60-day rule, AC-09)
> **When** the owner clears its mark or changes it to skipped
> **Then** before the change, the owner is told that without the applied mark the posting will be removed at clean-up. Once changed, it is kept until the end of the next calendar day (its grace day), and the owner can mark it applied again until then. Every closed posting whose mark the owner cleared, whatever its age, stays in the marked postings labelled "Cleared, removed after <the date clean-up will remove it>" until it is removed, and the owner can mark it again there. If a source offers the posting again, it is no longer due for removal and keeps its place by the normal rules.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `collector/infra/repo/open-postings.ts` + `app/open-postings.ts`: `postingsById(db, ids, { includeClosed })` — every listing named, `url` only for open http(s) listings
- [ ] `collector/app/retention-outlook.ts`: `retentionOutlook(deps, postingIds, now)` → per id `{ pastRetention: boolean, removalDate: string | null }` (owner's time zone, same rule and day as `dailyCleanup`)
- [ ] `apps/server/test/collector-read-exports.integration.test.ts` with a fake clock and a disabled-period case

## Edge cases

| Case | Behaviour |
|---|---|
| Posting re-offered by a source | No longer past retention; removal date moves (AC-07 last sentence) |
| All sources disabled for some days | Those days are not counted |
| Closed listing | Named, `url: null` |
| Unknown id | Left out of the result |

## Definition of Done

**Done when:** An integration test shows postingsById returns closed postings with every source named and links only for open listings, and retentionOutlook returns past-60-days and the removal date matching what dailyCleanup would do, disabled-source days not counted.

- [ ] integration test passes, including the disabled-days case
- [ ] `dailyCleanup` and the outlook agree on the same seeded postings
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
