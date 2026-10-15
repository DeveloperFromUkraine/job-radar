---
id: T06
title: "Write the tracking repo: guarded mark writes, undo, and the mark reads every flow needs"
layer: "infra"
deps: ["T01", "T02"]
blocks: ["T07", "T08", "T09"]
acs: ["AC-03", "AC-04", "AC-15"]
files_hint: ["apps/server/src/modules/tracking/infra/repo.ts", "apps/server/test/tracking-repo.integration.test.ts", "apps/server/test/helpers/tracking-fixtures.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T06 — Write the tracking repo: guarded mark writes, undo, and the mark reads every flow needs

## Place in the sequence

- **Blocked by:** T01 — Create the tracking_marks table and promote its staged migration, T02 — Write the mark state machine, undo guard and grace day as pure domain functions · **Blocks:** T07 — Implement the mark, change, clear and undo use cases with their error mapping and MarkState, T08 — Implement ProtectedPostings in tracking and wire it into the collector in app.ts, T09 — Implement tracking's read queries for search: marked ids, the marked order, and look-alike hints · **Wave:** 2 (after its deps finish).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to undo a mark in the moment after I set it
> **So that** a mis-click doesn't hide a posting I wanted
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The only SQL in tracking: every write is one synchronous statement, and the undo guard is in the WHERE clause.

## Inlined context

> Mark consistency: Each change is one synchronous SQLite statement on the shared connection, so there are no partial writes. Undo is one update guarded by the change id. A mark is confirmed to the owner only after the write returns (spec §6 Durability)
>
> — `sad.md §8, Mark consistency, abridged` · full text: [sad.md](../sad.md)

> `change_id` … Undo is one `UPDATE … WHERE posting_id = ? AND change_id = ?`. Zero rows changed means the mark changed elsewhere (AC-04), even back to the same mark.
>
> — `data-model.md §Entities, tracking_marks.change_id, verbatim` · full text: [data-model.md](../data-model.md)

> Persist and read hints: The mark row is keyed by posting id and cascades on posting delete (Flows 1, 4, 6). The marked view reads marks ordered by mark time, and cleared-closed rows by cleared time (Flow 3). Every page and waiting count reads the set of currently marked ids (Flows 2, 5). Clean-up asks for applied rows or applied-lost-within-grace among candidate ids (Flow 6).
>
> — `sad.md §6, Flags from sequences, abridged` · full text: [sad.md](../sad.md)

> `seedMarks(db, postingIds, { mark, markedAt, appliedLostAt })` — inserts mark rows directly, with fresh UUIDv7 change ids.
>
> — `data-model.md §Test fixtures, verbatim` · full text: [data-model.md](../data-model.md)

`infra` holds the one marks table. — `sad.md §5, verbatim`

> **Hard rule:** Postings and listings, their open/closed state, merging and clean-up belong to the collector (collector ADR-0005). The ordered list and its snapshots belong to search (search ADR-0003). This feature reads both through their `app/` exports and never writes collector tables.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `posting_id` | text | PK, FK → `collector_postings.id` ON DELETE CASCADE | read + written |
| `mark` | text | `applied` \| `skipped`; `NULL` = cleared (row kept) | read + written |
| `marked_at` | integer | NOT NULL; when the current state was set | read + written |
| `previous_mark` | text | `NULL` with `previous_marked_at` `NULL` = never marked (undo deletes the row) | read + written |
| `previous_marked_at` | integer | the previous state's original date, restored by undo | read + written |
| `applied_lost_at` | integer | starts the grace day; `NULL` when marked applied again | read + written |
| `previous_applied_lost_at` | integer | restored by undo | read + written |
| `change_id` | text | NOT NULL, UUIDv7, replaced on every change, undo included | read + written |

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

### AC-15 — error

> **Given** a posting on screen was removed by clean-up after the list was loaded
> **When** the owner marks it or changes its mark
> **Then** the owner is told the posting is no longer in job-radar, and its card leaves the list without any mark being recorded
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tracking/infra/repo.ts`: `getMark`, `writeMark` (upsert of the row T02 computed), `undoGuarded` (UPDATE … WHERE change_id; returns rows changed), `deleteGuarded` (first-mark undo, same guard)
- [ ] Reads: `markedIds()` (`mark IS NOT NULL`), `markedRows({ includeCleared })` ordered by `marked_at` desc then id, `rowsFor(ids)`, `markedWithCompanyTitle()` joined through the collector's export (no SQL on collector tables beyond the FK join the data-model plans)
- [ ] `apps/server/test/helpers/tracking-fixtures.ts`: `seedMarks`
- [ ] `apps/server/test/tracking-repo.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Guarded undo with a stale change id | 0 rows changed; nothing written (AC-04) |
| Write for a posting removed since the list loaded | FK error surfaces as a typed repo error (AC-15) |
| Two writes to the same posting back to back | Last write wins; each gets its own change id |

## Definition of Done

**Done when:** tracking-repo.integration.test.ts passes on a temp DB: upsert of the computed row, guarded undo (1 row vs 0 rows), first-mark undo deletes, write for a removed posting raises the FK error, and the marked-ids / marked-order / protected-among reads return the expected sets.

- [ ] `tracking-repo.integration.test.ts` passes
- [ ] repo is the only file in `tracking/` with SQL
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
