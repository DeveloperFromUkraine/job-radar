# Audit — data-model — remote-boards-collector — 2026-10-02

## Staged migrations

The migrations are staged and not yet in the live `apps/server/drizzle/` tree. `implement` promotes them.

| Ordinal | Up | Down | Creates |
|---|---|---|---|
| 01 | `docs/features/remote-boards-collector/migrations/01_create_sources.up.sql` | `…/01_create_sources.down.sql` | `collector_sources`, `collector_source_disabled_periods`, `collector_request_ledger`, `collector_source_flags` + 2 indexes |
| 02 | `…/02_create_runs.up.sql` | `…/02_create_runs.down.sql` | `collector_runs`, `collector_run_sources` + 2 indexes |
| 03 | `…/03_create_postings.up.sql` | `…/03_create_postings.down.sql` | `collector_postings`, `collector_listings` + 3 indexes |
| 04 | `…/04_create_collector_state.up.sql` | `…/04_create_collector_state.down.sql` | `collector_state`, `collector_app_sessions` |

## Promote-time hint (confirmed with the owner)

The repo uses drizzle-kit (project ADR-0003): migrations are generated from `src/modules/*/infra/schema.ts` into `apps/server/drizzle/` with a journal and snapshots, and they only go forward. The live tree holds `0000_init` only, so the next number is about `0001`. drizzle-kit assigns it at generation time.

The staged SQL is the **reference schema**, not a file to copy:

1. Write `apps/server/src/modules/collector/infra/schema.ts` matching the staged SQL. Use Drizzle `uniqueIndex(...).on(t.status).where(sql\`status = 'running'\`)` for the partial index and `integer({ mode: "boolean" })` for `is_first_fill`.
2. Run `pnpm --filter @job-radar/server db:generate`, which writes one `0001_*.sql`.
3. Compare the **resulting schema**, not the SQL text: apply both to temporary databases and diff `sqlite_master`. drizzle-kit omits `IF NOT EXISTS` and orders statements differently.
4. The `.down.sql` files are **not promoted**. They are a manual rollback for a development database. The repo's rollback is still "restore the `*.bak-*` file `db:migrate` takes before migrating".

## Verification run (better-sqlite3 13 on Node 22, `foreign_keys = ON`)

- Up 01→04 created 17 objects. Up applied twice is idempotent. Down 04→01 leaves 0 objects. Up again gives an identical schema.
- A second `running` run is rejected (`SQLITE_CONSTRAINT_UNIQUE`). A `finished` run beside a running one is accepted.
- A ledger row for an unknown source is rejected (`SQLITE_CONSTRAINT_FOREIGNKEY`). A duplicate (source, item id) is rejected (`SQLITE_CONSTRAINT_UNIQUE`).
- Deleting a posting cascades to its listings.
- `EXPLAIN QUERY PLAN`: match key, item lookup, absent-from-run, listings of a posting, ledger window (covering), running run and latest outcomes per source each use the intended index.

## Self-check

| Check | Result |
|---|---|
| Naming follows the convention | Pass. snake_case, `collector_` prefix, index names `<table>_<cols>_idx` / `_uq` |
| Down reversibility | Pass. Every CREATE TABLE / INDEX has a DROP, verified by an empty schema after down |
| FK indexes | Pass. `disabled_periods.source_id`, `request_ledger.source_id`, `source_flags.source_id` (PK prefix), `run_sources.run_id` (PK prefix), `run_sources.source_id`, `listings.posting_id`, `listings.source_id` (unique-index prefix) |
| Convention adherence | Pass, with the deliberate deviations below |

## Deviations (deliberate)

- **`collector_sources.id` is a source code, not a UUIDv7** (project ADR-0003 says UUIDv7). The set of sources is fixed in code, the code matches the settings-file keys, and it reads well in logs. Source rows are upserted at start-up from the adapter registry, so there is no seed migration.
- **`collector_state.id` is the integer `1`**, a singleton row. The value is not enforced by a `CHECK`, per the no-`CHECK` convention.
- **`collector_listings.last_seen_run_id` has no FK.** Runs are pruned after 60 days and listings live longer.
- **No index on `collector_postings.closed_at` / `last_offered_at`**, although sad.md §6 Notes lists them as lookup hints. The query runs once a day over ≤ 40k rows, while `last_offered_at` is rewritten on every fetch, so an index would cost more than the scan.
- **Down files are not part of the repo's mechanism** (forward-only drizzle-kit). They are kept as the skill's reversibility record and as a manual dev rollback.

## Conventions set here for later modules

This is the first module that owns tables. The owner confirmed: snake_case with a module prefix, no `CHECK` / DB `DEFAULT` / triggers, no blanket audit columns, hard delete, FK + `UNIQUE` + partial unique indexes allowed. `docs/architecture-map.md` §Conventions does not record these yet. Add them when `/sdd:survey` is re-run (already listed in sad.md §11).

## Drift

No drift check: there is no collector domain layer yet (`apps/server/src/modules/` holds only `health/`), and no `_drift/` files.

## Breaking changes

None. Every table is new, so no expand → backfill → contract steps.

## Seeds

None. There is no bootstrap or lookup data: source rows come from the start-up upsert, and the settings defaults live in code. Test fixtures are listed in `data-model.md` §Test fixtures.

## Open items

- None marked `<!-- TBD -->`.
- The merge tie-break when two postings both qualify (sad.md §6 Notes) does not affect the schema. It stays with `tasks` / domain tests.
- Spec §8 Q1 (We Work Remotely) and Q3 (Himalayas rate) do not affect the schema. They change adapter code and settings defaults only.

Next stage: `/sdd:api remote-boards-collector`.
