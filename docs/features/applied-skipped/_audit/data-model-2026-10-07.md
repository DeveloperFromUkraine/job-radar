# Audit — data-model — applied-skipped — 2026-10-07

## Staged migrations

The migrations are staged and are not yet in the live `apps/server/drizzle/` tree. `implement` promotes them.

| Ordinal | Up | Down | Creates |
|---|---|---|---|
| 01 | `docs/features/applied-skipped/migrations/01_create_tracking_marks.up.sql` | `…/01_create_tracking_marks.down.sql` | `tracking_marks` (FK → `collector_postings` ON DELETE CASCADE) |

The collector and search schemas are unchanged: no ALTER, no new index, so no expand/backfill/contract is needed.

## Promote-time hint

Same drizzle-kit flow as the collector and search (project ADR-0003). The live tree ends at `0003_milky_loa`, so the next number is about `0004`. drizzle-kit assigns the real number and name when it generates the file, and another wave-4 feature (roadmap steps 4, 5, 10) may promote first.

1. Write `apps/server/src/modules/tracking/infra/schema.ts` to match the staged SQL: `postingId: text("posting_id").primaryKey().references(() => postings.id, { onDelete: "cascade" })`, importing `postings` from the collector's schema. The config glob already picks it up.
2. Run `pnpm --filter @job-radar/server db:generate`.
3. Compare the resulting schema (`sqlite_master` + `pragma foreign_key_list`), not the SQL text. Add `test/tracking-schema.integration.test.ts` like the search and collector ones.
4. The `.down.sql` is not promoted. It is a manual rollback for a development database only. Real rollback restores the `*.bak-*` file.

## Verification (better-sqlite3 on Node 22, in-memory, `foreign_keys = ON`)

- Ran live `0000`–`0003`, then staged up twice: idempotent. Down restores the pre-up schema exactly. Up again gives an identical schema.
- `pragma foreign_key_list('tracking_marks')` → `collector_postings.posting_id → id`, `ON DELETE CASCADE`.
- AC-15: inserting a mark for a missing posting fails with `SQLITE_CONSTRAINT_FOREIGNKEY`.
- AC-09: deleting 1,000 marked postings removed their 1,000 mark rows by cascade (6.1 ms).
- Seeded 15,000 postings (10,000 open) and 5,000 marks. `EXPLAIN QUERY PLAN` and p95 for every flow read are in `data-model.md` §Indexes. All are under 6 ms.

## Self-check

| Check | Result |
|---|---|
| Naming follows the convention | Pass. snake_case, `tracking_` module prefix, `*_at` epoch-ms integers, `*_id` text ids |
| Down reversibility | Pass. CREATE TABLE ↔ DROP TABLE, verified by schema diff |
| FK indexes | Pass. The only FK, `posting_id`, is the primary key |
| Convention adherence | Pass. Enum-like text checked in TS, no CHECK/DEFAULT/trigger, no audit columns, UUIDv7 ids, no seed |

## Index decisions

- **Discarded:** a partial index on `posting_id WHERE mark IS NOT NULL` (every page and waiting count). A scan takes 1.96 ms, and almost every row is marked, so the index would read the same rows.
- **Discarded:** `tracking_marks(marked_at)` for the marked view order. A sort of 5,000 rows takes 4.89 ms against the 1 s NFR.
- Revisit both if the spec §6 NFR tests show tracking reads in `durationMs`.

## Design notes (derived, not new decisions)

- **Undo of a first mark deletes the row.** "Never marked" is encoded as `previous_mark` and `previous_marked_at` both `NULL`. `tracking/domain/mark.ts` owns that rule.
- **`previous_applied_lost_at`** is not listed in sad.md §5's state bullets. It is needed so that undo of a re-apply restores the exact "removed after" date (AC-03). The same rule (exact previous state) adds one more column; flag for the reviewer, no ADR.
- **ADR-0006 supersession** (ADR-0003 here): `docs/features/remote-boards-collector/data-model.md` line 20 and the `MarkedPostings` port still describe the old meaning. The port rename is a `tasks` item. The collector doc should get a pointer to ADR-0003 when `implement` touches it.

## Drift

- `tracking`: no domain layer exists yet, so there is nothing to compare.
- `search`: `infra/schema.ts` matches live `0003_milky_loa.sql`.
- `collector`: unchanged since the 2026-10-05 check, and `test/collector-schema.integration.test.ts` guards it. No `_drift/` fixes.

## Seeds

None. Test fixtures are listed in `data-model.md`, with no PII (`Example Co`, `example.test`). The AC-10 `Acme` names are fictional spec examples, used only in a unit-test table.

## Deviations / TBD

None.

Next stage: `/sdd:api applied-skipped`. The feature adds mark, change, clear and undo routes, so there is a contract change and `api` cannot be skipped.
