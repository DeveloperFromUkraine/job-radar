---
id: T09
title: "Keep realness with every mark and once a day: mark records, daily share, tracking's onMarkChanged hook"
layer: "app"
deps: ["T08"]
blocks: ["T10"]
acs: ["AC-14"]
files_hint: ["apps/server/src/modules/realness/app/records.ts", "apps/server/src/modules/realness/infra/repo.ts", "apps/server/src/modules/realness/index.ts", "apps/server/src/modules/tracking/app/deps.ts", "apps/server/src/modules/tracking/app/marks.ts", "apps/server/src/app.ts", "apps/server/test/realness-records.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T09 — Keep realness with every mark and once a day: mark records, daily share, tracking's onMarkChanged hook

## Place in the sequence

- **Blocked by:** T08 — Implement assess(): work out penalty and signals for a set of postings with switch-on rules · **Blocks:** T10 — Assess at snapshot build, order by penalty, and present realness and realness_on in search · **Wave:** 4.
- **Lane:** shares `apps/server/src/app.ts`, `apps/server/src/modules/realness/index.ts`, `apps/server/src/modules/realness/infra/repo.ts` with T07 — serialized; shares `apps/server/src/app.ts` with T10 — serialized.

## Why (user story)

> **As a** owner
> **I want** each lowered posting to name every signal behind its penalty
> **So that** I can check the reason on the board and decide for myself
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task keeps the evidence the §7 checks compare — what realness said about a posting when the owner marked it, and how much of each day's list was lowered.

## Inlined context

> **Chosen:** option 1. It follows the one-step-one-module convention, keeps search's ordering change to a penalty it reads, and breaks the only cycle — tracking → realness → tracking — with one injected hook, the same composition-root pattern match-score ADR-0004 uses.
>
> — `adr/0001, Decision outcome, verbatim` · full text: [0001-ship-realness-as-a-new-realness-module-read-by-search-and-told-of-marks-by-tracking.md](../adr/0001-ship-realness-as-a-new-realness-module-read-by-search-and-told-of-marks-by-tracking.md)

> - Assumed: AC-14 mark records go in `realness_mark_records` (one row per marked posting, removed with the posting). They are written through tracking's injected `onMarkChanged` hook after the mark is saved, computed with switch-on rules, and deleted on clear. A failed write is logged and never fails the mark.
> - Assumed: the daily share goes in `realness_daily_shares` (one row per calendar day). It is written with `INSERT OR IGNORE` on the day's first build of the owner's list (a one-off look is not counted) and computed with switch-on rules even when the switch is off.
>
> — `sad.md §4, Assumptions ledger, verbatim` · full text: [sad.md](../sad.md)

> T->>R: mark changed → R: assess the posting with switch-on rules now → R->>D: replace the record with the latest mark, penalty and signals
> alt the owner clears the mark, or undoes the only mark: R->>D: remove the posting's record
> else the owner undoes a change to an earlier mark: R->>D: record the restored mark with its signals now
> else the record cannot be written: R->>R: log a warning, the mark stands
> alt the posting is removed by clean-up: its record goes with it
>
> — `sad.md §6, Flow 7, abridged` · full text: [sad.md](../sad.md)

> alt a later opening the same day: today already has a share, nothing written
> else a one-off look at another country: ignored, no share written
> else realness is off: share still kept from switch-on rules
> else the share cannot be written: log a warning, the list is shown as usual
>
> — `sad.md §6, Flow 6 alts, abridged` · full text: [sad.md](../sad.md)

> Realness logs a warning, `module=realness`, when a mark record or daily share cannot be written, with the posting id or day only.
>
> — `sad.md §7, Monitoring, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table | Columns written | Change |
|---|---|---|
| `realness_mark_records` | `posting_id` PK, `mark` (`applied`\|`skipped`), `penalty` 0–30, `signals` JSON (`[]` = none), `recorded_at` | upsert on set/change/undo-to-earlier; delete on clear / undo of the only mark |
| `realness_daily_shares` | `day` PK `YYYY-MM-DD` (machine zone), `postings`, `lowered`, `recorded_at` | `INSERT OR IGNORE` |

— `data-model.md §Mark-record + Daily-share aggregates, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (Tracking's mark routes keep their responses unchanged.)

## Acceptance criteria

### AC-14 — happy

> **Given** a posting in the owner's list, with realness on or off and in either order
> **When** the owner marks it applied or skipped
> **Then** job-radar keeps, with the mark, the posting's penalty and signals at that moment as realness would work them out with the switch on, so the §7 checks can compare marks on lowered and not-lowered postings; the first time the owner opens the list on a calendar day of their time zone, it also keeps the share of postings in that list that had a penalty, counted on the list as the owner's saved skills and remote filter give it (a one-off look is ignored); a day the list is not opened has no share; changing the mark keeps the record of the latest mark only, and clearing the mark removes its record
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `onMarkChanged(postingId, mark | null)`: null → delete; else read the posting through `collector/app`, `assess` it, upsert the record; wrap in try/catch → `log.warn({module:"realness", postingId})` — `realness/app/records.ts`, `infra/repo.ts`
- [ ] `noteListShown(now, assessments, filterMode)`: skip when `filterMode === "look"`; else `INSERT OR IGNORE` today's `{postings, lowered}`; try/catch → warn with the day — `realness/app/records.ts`
- [ ] Expose both from `createRealness` — `realness/index.ts`
- [ ] Add optional `onMarkChanged?` to `TrackingDeps`; call it after the mark is saved in `setMark` and `undoMark` with the resulting mark (or null) — `tracking/app/deps.ts`, `tracking/app/marks.ts`
- [ ] Pass `realness.onMarkChanged` into `createTracking` — `apps/server/src/app.ts`
- [ ] Integration test incl. switch off and a forced write failure — `apps/server/test/realness-records.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Mark applied → skipped | one row, `mark: skipped`, penalty/signals recomputed now |
| Mark cleared, or the only mark undone | row deleted |
| Undo of a change back to the earlier mark | row holds the restored mark with signals now |
| Switch off when marking | record still uses switch-on rules |
| Second opening the same day / a one-off look | no new share |
| Record or share write throws | warning logged; the mark / list response is unchanged |

## Definition of Done

- [ ] records test passes, incl. the forced-failure cases
- [ ] existing `tracking-*.integration.test.ts` suites stay green
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
