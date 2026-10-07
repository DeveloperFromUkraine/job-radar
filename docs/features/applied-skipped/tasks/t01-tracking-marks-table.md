---
id: T01
title: "Create the tracking_marks table and promote its staged migration"
layer: "migration"
deps: []
blocks: ["T06"]
acs: ["AC-09", "AC-15"]
files_hint: ["docs/features/applied-skipped/migrations/01_create_tracking_marks.up.sql", "docs/features/applied-skipped/migrations/01_create_tracking_marks.down.sql", "apps/server/src/modules/tracking/infra/schema.ts", "apps/server/drizzle/", "apps/server/test/tracking-schema.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T01 — Create the tracking_marks table and promote its staged migration

## Place in the sequence

- **Blocked by:** — · **Blocks:** T06 — Write the tracking repo: guarded mark writes, undo, and the mark reads every flow needs · **Wave:** 1 (no deps, starts at once).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** my marks to hold when boards merge, close, reopen or re-list a posting, and when job-radar restarts
> **So that** a decided posting doesn't come back on its own
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The one table that makes a mark durable across restarts and lets clean-up take a skipped posting's mark with it.

## Inlined context

> **Promote-time hint.** Same drizzle-kit flow as the collector and search (project ADR-0003). The live tree ends at `0003_milky_loa`, so the next number is about `0004`. drizzle-kit assigns the real number and name when it generates the file. 1. Write `apps/server/src/modules/tracking/infra/schema.ts` to match the staged SQL: `postingId: text("posting_id").primaryKey().references(() => postings.id, { onDelete: "cascade" })`, importing `postings` from the collector's schema. The config glob already picks it up. 2. Run `pnpm --filter @job-radar/server db:generate`. 4. The `.down.sql` is not promoted. It is a manual rollback for a development database only.
>
> — `_audit/data-model-2026-10-07.md §Promote-time hint, abridged` · full text: [_audit](../_audit/data-model-2026-10-07.md)

> Status-like text values (`applied` / `skipped`) are checked in TypeScript, not by `CHECK`. There are no DB `DEFAULT`s, no triggers and no blanket audit columns. `foreign_keys = ON` is already set in `core/db.ts`, which the cascade and the AC-15 refusal rely on.
>
> — `data-model.md §intro, abridged` · full text: [data-model.md](../data-model.md)

> **Decision:** The row references the posting with on-delete cascade, so clean-up removes skipped and cleared postings like unmarked ones (AC-09). A write for a removed posting fails on that reference (AC-15). This partly supersedes collector ADR-0006.
>
> — `adr/0003, Decision outcome, abridged` · full text: [ADR-0003](../adr/0003-keep-one-mark-row-per-posting-with-its-previous-state-deleted-with-the-posting.md)

> **Hard rule:** Postings and listings, their open/closed state, merging and clean-up belong to the collector (collector ADR-0005). The ordered list and its snapshots belong to search (search ADR-0003). This feature reads both through their `app/` exports and never writes collector tables.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `posting_id` | text | PK, FK → `collector_postings.id` ON DELETE CASCADE | added |
| `mark` | text | `applied` \| `skipped`; `NULL` = cleared (row kept) | added |
| `marked_at` | integer | NOT NULL; when the current state was set | added |
| `previous_mark` | text | `NULL` with `previous_marked_at` `NULL` = never marked (undo deletes the row) | added |
| `previous_marked_at` | integer | the previous state's original date, restored by undo | added |
| `applied_lost_at` | integer | starts the grace day; `NULL` when marked applied again | added |
| `previous_applied_lost_at` | integer | restored by undo | added |
| `change_id` | text | NOT NULL, UUIDv7, replaced on every change, undo included | added |

— `data-model.md §Entities, tracking_marks, abridged` · full text: [data-model.md](../data-model.md)

Staged pair: `docs/features/applied-skipped/migrations/01_create_tracking_marks.up.sql` / `.down.sql`. No index beyond the PK (data-model §Indexes: every other candidate was measured and discarded).

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-09 — cross-context

> **Given** one skipped and one applied posting are each past the collector's 60-day clean-up limit (more than 60 days since closing, or since any enabled source last offered it, with days when all its sources were disabled not counted)
> **When** the collector's daily clean-up runs
> **Then** the skipped posting is removed exactly as an unmarked one would be, and the applied posting is kept for good, whatever its age
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — error

> **Given** a posting on screen was removed by clean-up after the list was loaded
> **When** the owner marks it or changes its mark
> **Then** the owner is told the posting is no longer in job-radar, and its card leaves the list without any mark being recorded
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `apps/server/src/modules/tracking/infra/schema.ts` (`trackingMarks`) to match `01_create_tracking_marks.up.sql` column for column
- [ ] Run `pnpm --filter @job-radar/server db:generate`; diff the generated `apps/server/drizzle/00NN_*.sql` against the staged up.sql (same columns, PK, `ON DELETE CASCADE`)
- [ ] Add `apps/server/test/tracking-schema.integration.test.ts` on a temp DB (`test/helpers/temp-db.ts`): table exists, cascade on posting delete, FK refusal for an unknown posting id
- [ ] Leave the `.down.sql` staged only (manual dev rollback)

## Edge cases

| Case | Behaviour |
|---|---|
| Another wave-4 feature promoted `0004` first | Let drizzle-kit pick the next number; never rename an existing migration |
| Posting deleted by clean-up | Its mark row is deleted by cascade (AC-09) |
| Insert for a posting id that does not exist | SQLite FK error; T07 maps it to `TRACKING_POSTING_NOT_FOUND` (AC-15) |

## Definition of Done

**Done when:** drizzle-kit generates the next migration from tracking/infra/schema.ts matching the staged SQL; it applies on a temp DB, deleting a posting cascades its mark row, and inserting a mark for an unknown posting id fails on the reference.

- [ ] the generated migration is promoted to live `apps/server/drizzle/`, then applies on a temp DB (and the staged down.sql drops the table on a dev DB)
- [ ] `tracking-schema.integration.test.ts` passes: cascade + FK refusal
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
