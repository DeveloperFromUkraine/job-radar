# Audit — data-model — match-score — 2026-10-15

## Staged migrations

The migrations are staged and are not yet in the live `apps/server/drizzle/` tree. `implement` promotes them.

| Ordinal | Up | Down | Changes |
|---|---|---|---|
| 01 | `docs/features/match-score/migrations/01_create_matching_settings.up.sql` | `…/01_create_matching_settings.down.sql` | `matching_settings` (singleton, no FK) |
| 02 | `docs/features/match-score/migrations/02_create_matching_scores.up.sql` | `…/02_create_matching_scores.down.sql` | `matching_scores`, FK → `collector_postings` ON DELETE CASCADE |
| 03 | `docs/features/match-score/migrations/03_create_matching_spend.up.sql` | `…/03_create_matching_spend.down.sql` | `matching_spend` + `matching_spend_started_idx` |
| 04 | `docs/features/match-score/migrations/04_add_search_list_order.up.sql` | `…/04_add_search_list_order.down.sql` | `search_state.list_order` (nullable, no backfill) |

The only change to an existing table is a new nullable column, so no expand/backfill/contract is needed. The collector and tracking schemas are unchanged.

## Promote-time hint

Same drizzle-kit flow as the earlier features (project ADR-0003). The live tree ends at `0005_stormy_bucky`, so the next number is about `0006`. drizzle-kit assigns the real number and name when it generates the file. Roadmap step 10 runs in the same wave, but it does not touch the schema.

1. Write `apps/server/src/modules/matching/infra/schema.ts` to match staged 01–03. Use `text(…, { enum: [...] })` for `kind`, `outcome` and `scoring_problem`, `index("matching_spend_started_idx").on(t.startedAt)`, and `.references(() => postings.id, { onDelete: "cascade" })` as `tracking/infra/schema.ts` does. Add `listOrder: text("list_order", { enum: ["newest", "best_match"] })` to `search/infra/schema.ts`. The config glob already picks up the new module.
2. Run `pnpm --filter @job-radar/server db:generate`. All four staged files become one generated migration, which is expected.
3. Compare the resulting schema (`sqlite_master` / `pragma table_info`), not the SQL text. Add `test/matching-schema.integration.test.ts` like the search, tracking and remote-filter ones.
4. The `.down.sql` files are not promoted. They are manual rollbacks for a development database only. Real rollback restores the `*.bak-*` file.

## Verification (better-sqlite3 on Node 22, in-memory, `foreign_keys = ON`)

- Applied the live migrations `0000`–`0005`, then staged 01–04. Re-running 01–03 is idempotent (`IF NOT EXISTS`). Re-running 04 fails with "duplicate column name". SQLite has no `ADD COLUMN IF NOT EXISTS`, the collector's staged `05_add_fill_cursor` has the same limit, and drizzle's migration journal prevents a re-run in practice.
- Running the downs in reverse restores the pre-up schema exactly. Applying the ups again gives an identical schema.
- `pragma table_info` matches the data-model.md tables.
- The FK refuses a score for an unknown posting (`SQLITE_CONSTRAINT_FOREIGNKEY`). Deleting the posting cascades and removes the score.
- Inserting a settings row without `cap_usd_micros` fails with `SQLITE_CONSTRAINT_NOTNULL`. The lazy upsert must write the $5 default.
- `EXPLAIN QUERY PLAN`:
  - month's spend → `SEARCH matching_spend USING INDEX matching_spend_started_idx (started_at>?)`
  - scores by ids → `SEARCH … USING INDEX sqlite_autoindex_matching_scores_1`
  - could-not-be-scored count → `SCAN matching_scores`. This is accepted: at most about 10,000 rows, read once per health request.
- `erDiagram` renders with mermaid-cli.

## Self-check

| Check | Result |
|---|---|
| Naming follows the convention | Pass. snake_case, `matching_` module prefix, `*_at` epoch-ms integers, enums as text, JSON as text |
| Down reversibility | Pass. CREATE TABLE ↔ DROP TABLE, CREATE INDEX ↔ DROP INDEX, ADD ↔ DROP COLUMN. Verified by schema diff |
| FK indexes | Pass. The only FK, `matching_scores.posting_id`, is the PK |
| Convention adherence | Pass. Singleton `id = 1`, no CHECK/DEFAULT/trigger, no blanket audit columns, no seeds, cascade like `tracking_marks` |

## Drift

N/A for matching: the module has no code yet. For search, `SearchStateRow` in `search/infra/repo.ts` spreads the row, so the new column appears there once `schema.ts` gains it. That is a read-side addition, not drift. `implement` maps `NULL` to `newest`.

## Deviations and TBDs

- **Table names differ from sad.md §5.** `match_scores` → `matching_scores` and `scoring_spend` → `matching_spend`, to keep the module prefix. sad.md §5 should be updated to match during `api` or `tasks`. This is a naming fix only.
- **Money unit.** `*_usd_micros` integers are a new convention in this repo, because no earlier feature stored money. Whole cents would round a sub-cent attempt.
- **Profile as one JSON column.** This follows the `last_skills` and `categories` precedent. Field-level validation (AC-16) and change detection (AC-10) are TypeScript.
- **Scorer version.** ADR-0008 says that changing the prompt or schema makes scores stale "through the profile-version fingerprint". This is realised as a separate `scorer_version` column, so a prompt change does not bump the owner's profile version. On the card it reads as previous-profile staleness.
- **Merge staleness (sad.md §6 flag).** `text_fingerprint` covers the open listings' location restrictions (ADR-0005). A merge that adds a listing with a different stated location therefore makes the score stale. A merge whose listing repeats the same text does not, which is the intended reading of AC-06.
- No `<!-- TBD -->`.

Next stage: `/sdd:api match-score`.
