---
id: T02
title: "Write the mark state machine, undo guard and grace day as pure domain functions"
layer: "domain"
deps: []
blocks: ["T06"]
acs: ["AC-03", "AC-04", "AC-06", "AC-07"]
files_hint: ["apps/server/src/modules/tracking/domain/mark.ts", "apps/server/src/modules/tracking/domain/mark.test.ts", "apps/server/src/modules/tracking/domain/grace.ts", "apps/server/src/modules/tracking/domain/grace.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T02 — Write the mark state machine, undo guard and grace day as pure domain functions

## Place in the sequence

- **Blocked by:** — · **Blocks:** T06 — Write the tracking repo: guarded mark writes, undo, and the mark reads every flow needs · **Wave:** 1 (no deps, starts at once).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to undo a mark in the moment after I set it
> **So that** a mis-click doesn't hide a posting I wanted
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to see the postings I marked, including closed ones, and change or clear a mark
> **So that** I can find a role I applied to when a recruiter replies, and fix a decision I regret
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

The rules that make Undo exact, a stale Undo refuse, and a lost applied mark protected for a grace day.

## Inlined context

> `domain` holds the rules the acceptance criteria state, pure and clock-injected: the mark state machine: set, change, clear, and undo guarded by the change id (AC-03, AC-04, AC-06); the grace day (AC-07); which postings are protected (AC-09).
>
> — `sad.md §5, Building block view, abridged` · full text: [sad.md](../sad.md)

> The grace day covers any loss of applied, whether cleared or changed to skipped. It lasts until the end of the next calendar day in the owner's time zone, the same zone clean-up uses for its day (collector `deps.timeZone`). An undo back to applied simply ends it.
>
> — `sad.md §4, Inline decisions, verbatim` · full text: [sad.md](../sad.md)

> Protection from clean-up: The port answers "protected" for applied postings and for postings that lost applied until the end of the next calendar day. Skipped and cleared postings outside their grace day are not protected.
>
> — `sad.md §8, Protection from clean-up, abridged` · full text: [sad.md](../sad.md)

> Setting the state the posting already has (for example Applied from a stale card in a second window) writes nothing. It returns 200 with the current state and change id, so the original mark date is kept (api-sync-report F-3). Clearing a posting that was never marked is the same no-op.
>
> — `contracts/openapi.yaml, setMark description, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

> Marks are stored as UTC epoch milliseconds. The grace day ends at midnight after the next calendar day in the owner's time zone, the zone clean-up already uses. The clock is injected, so grace and undo are tested with a fake clock
>
> — `sad.md §8, Time, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

The functions compute the next `tracking_marks` row value; they do not touch the DB.

| Column | Type | Constraints | Change |
|---|---|---|---|
| `posting_id` | text | PK, FK → `collector_postings.id` ON DELETE CASCADE | computed (read-only here) |
| `mark` | text | `applied` \| `skipped`; `NULL` = cleared (row kept) | computed (read-only here) |
| `marked_at` | integer | NOT NULL; when the current state was set | computed (read-only here) |
| `previous_mark` | text | `NULL` with `previous_marked_at` `NULL` = never marked (undo deletes the row) | computed (read-only here) |
| `previous_marked_at` | integer | the previous state's original date, restored by undo | computed (read-only here) |
| `applied_lost_at` | integer | starts the grace day; `NULL` when marked applied again | computed (read-only here) |
| `previous_applied_lost_at` | integer | restored by undo | computed (read-only here) |
| `change_id` | text | NOT NULL, UUIDv7, replaced on every change, undo included | computed (read-only here) |

— `data-model.md §Entities, tracking_marks, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-03 — happy

> **Given** the owner has just marked a posting, changed its mark or cleared it, and the notice with Undo is showing (it shows for 8 seconds and closes sooner when the owner marks or changes another posting, searches, turns the marked postings on or off, or reloads; once it closes, Undo is no longer offered and the mark is changed from the marked postings)
> **When** the owner presses Undo
> **Then** the posting returns exactly to its earlier state (unmarked, or its previous mark with that mark's original date) and to its place in the list, the count is restored, and the posting keeps its "new" flag if it had one
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** the owner set a mark in one window, and since then that posting's mark was changed or cleared from any window, even back to the same mark
> **When** the owner presses Undo in the first window
> **Then** the mark is not reverted, because an undo only reverses a mark that nothing has changed since, and the owner is told the mark changed elsewhere and can see the current mark in the marked postings
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** a posting is shown in the marked postings
> **When** the owner changes its mark (applied to skipped or back) or clears it
> **Then** a changed mark replaces the old one (a posting has at most one mark) and the date updates. A cleared open posting returns to the main list and its counts in its publication-time position, and it counts as new only by the rule for new postings (first collected after the previous visit started), never because its mark was cleared. A cleared closed posting stays in the marked postings as AC-05 and AC-07 describe.
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a posting marked applied that clean-up would remove if it were not applied (it is past the collector's 60-day rule, AC-09)
> **When** the owner clears its mark or changes it to skipped
> **Then** before the change, the owner is told that without the applied mark the posting will be removed at clean-up. Once changed, it is kept until the end of the next calendar day (its grace day), and the owner can mark it applied again until then. Every closed posting whose mark the owner cleared, whatever its age, stays in the marked postings labelled "Cleared, removed after <the date clean-up will remove it>" until it is removed, and the owner can mark it again there. If a source offers the posting again, it is no longer due for removal and keeps its place by the normal rules.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tracking/domain/mark.ts`: `applyMark(row | null, mark | null, now, newChangeId)` → next row or `noop`; moves current → previous, sets `applied_lost_at` when applied is lost, clears it when applied is set again
- [ ] `tracking/domain/mark.ts`: `applyUndo(row, changeId, newChangeId)` → restored row / `delete` (first mark) / `changedElsewhere` when the change id is stale
- [ ] `tracking/domain/grace.ts`: `graceEnd(appliedLostAt, timeZone)` and `isProtected(row, now, timeZone)` (applied, or within grace)
- [ ] Unit tests beside the code with a fake clock: `mark.test.ts`, `grace.test.ts` (DST and month-end days included)

## Edge cases

| Case | Behaviour |
|---|---|
| Set the mark the posting already has | No-op: same row, same change id, original date kept |
| Clear a never-marked posting | No-op |
| Undo after any later change, even back to the same mark | `changedElsewhere`, nothing reverted (AC-04) |
| Undo of a first mark | Row deleted (posting unmarked again) |
| Undo back to applied | `applied_lost_at` restored from `previous_applied_lost_at`; grace ends |
| Applied lost at 23:59 local | Protected until 00:00 two calendar days later in the owner's time zone |

## Definition of Done

**Done when:** mark.test.ts and grace.test.ts pass with a fake clock over set / change / clear / no-op / undo (first mark, change, clear) / grace-day end at midnight after the next calendar day in the owner's time zone.

- [ ] `mark.test.ts` covers every row in the edge-case table
- [ ] `grace.test.ts` passes with a fake clock across a DST change
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
