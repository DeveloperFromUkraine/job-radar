# Audit — data-model — remote-filter — 2026-10-14

## Staged migrations

The migrations are staged and are not yet in the live `apps/server/drizzle/` tree. `implement` promotes them.

| Ordinal | Up | Down | Creates |
|---|---|---|---|
| 01 | `docs/features/remote-filter/migrations/01_create_remote_filter_settings.up.sql` | `…/01_create_remote_filter_settings.down.sql` | `remote_filter_settings` (singleton, no FK) |

The collector, search and tracking schemas are unchanged: no ALTER and no new index, so no expand/backfill/contract is needed. The "Anywhere" change (AC-10) only changes the values written into the existing `collector_listings.location_restriction` column. There is no backfill: the spec has unknown listings take the new reading the next time their source offers them.

## Promote-time hint

Same drizzle-kit flow as the collector, search and tracking (project ADR-0003). The live tree ends at `0004_tricky_sunfire`, so the next number is about `0005`. drizzle-kit assigns the real number and name when it generates the file, and another wave-4 feature (roadmap steps 4, 10) may promote first.

1. Write `apps/server/src/modules/remote-filter/infra/schema.ts` to match the staged SQL. Use `filterOn: integer("filter_on", { mode: "boolean" }).notNull()`. The config glob already picks it up.
2. Run `pnpm --filter @job-radar/server db:generate`.
3. Compare the resulting schema (`sqlite_master` / `pragma table_info`), not the SQL text. Add `test/remote-filter-schema.integration.test.ts` like the search and tracking ones.
4. The `.down.sql` is not promoted. It is a manual rollback for a development database only; real rollback restores the `*.bak-*` file.

## Verification (better-sqlite3 on Node 22.23, in-memory, `foreign_keys = ON`)

- Applied the live migrations `0000`–`0004`, then ran the staged up twice: idempotent. Down restores the pre-up schema exactly, and up again gives an identical schema.
- `pragma table_info`: `id INTEGER NN PK, country TEXT, filter_on INTEGER NN, look_country TEXT, look_started_at INTEGER`.
- Inserting a row without `filter_on` fails with `SQLITE_CONSTRAINT_NOTNULL`. The lazy upsert must write `filter_on`.
- `EXPLAIN QUERY PLAN` for the settings read is the integer primary key.

## Self-check

| Check | Result |
|---|---|
| Naming follows the convention | Pass. snake_case, `remote_filter_` module prefix, `*_at` epoch-ms integer, boolean as integer |
| Down reversibility | Pass. CREATE TABLE ↔ DROP TABLE, verified by schema diff |
| FK indexes | Pass. No FK |
| Convention adherence | Pass. Singleton `id = 1` like `search_state`, no CHECK/DEFAULT/trigger, no audit columns, no seed |

## Drift

N/A. The remote-filter module has no domain or infra code yet, so there is nothing to compare. The collector's listing schema is unchanged, and its `NormalizedListing.locationRestriction: string | null` still matches `collector_listings.location_restriction text`.

## Deviations and TBDs

- One deviation from `search_state`: `filter_on` is `NOT NULL`, where `search_state` keeps every column nullable. An unknown on/off state has no meaning (AC-07), and `is_first_fill` is the precedent for a NOT NULL boolean. The lazy upsert writes `true`.
- No `<!-- TBD -->`.

**Amended during `api` (2026-10-14):** `look_visit_started_at` was renamed `look_started_at` (the time the look was started). The old column needed remote-filter to know the current visit when a look starts, which would make it call search, a module cycle. Re-verified after the rename.

Next stage: `/sdd:api remote-filter`.
