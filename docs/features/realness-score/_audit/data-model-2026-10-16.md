# data-model audit — realness-score — 2026-10-16

**Migrations are staged — not yet in the live `apps/server/drizzle/` tree; `implement` promotes them.**

## Staged files

- `docs/features/realness-score/migrations/01_add_collector_listing_pay_field.{up,down}.sql`
- `docs/features/realness-score/migrations/02_add_collector_posting_reopened_at.{up,down}.sql`
- `docs/features/realness-score/migrations/03_create_realness_settings.{up,down}.sql`
- `docs/features/realness-score/migrations/04_create_realness_mark_records.{up,down}.sql`
- `docs/features/realness-score/migrations/05_create_realness_daily_shares.{up,down}.sql`

## Promote-time hint

drizzle-kit, sequential with generated names; the latest is `0006_silky_polaris.sql`, so the next is ≈ `0007_*`. `implement` changes the Drizzle schemas and runs `db:generate`. These files are the expected SQL to compare against, not files to copy. Another feature may promote first; then the number shifts.

## Verification

- Applied on an in-memory SQLite DB after all live migrations `0000`–`0006`: every up, then every down in reverse, then every up again. All passed, with foreign keys on.
- `erDiagram` render-checked with mermaid-cli.

## Self-check (4/4)

1. Naming: snake_case with a module prefix (`realness_*`), like `remote_filter_settings` and `tracking_marks`. Pass.
2. Down reversibility: 2 ADD COLUMN ↔ DROP COLUMN, 3 CREATE TABLE ↔ DROP TABLE. Pass.
3. FK indexes: `realness_mark_records.posting_id` is the PK. Pass.
4. Convention adherence: no CHECK, DEFAULT or trigger; integer epoch ms; boolean as integer; lazy singleton. Pass.

## Deviations

- sad.md §4/§5 said the switch is "NULL = on". Here the column is NOT NULL and written true with the row, and **no row** means on, following `remote_filter_settings.filter_on`. The behaviour is the same.

## Drift

None. `RawListing`/`NormalizedListing`/`OpenListing` have no pay field and `OpenPosting` has no `reopenedAt`/`matchKey` yet. Those are planned additions (sad.md §5), not drift between existing code and existing schema.

## Breaking changes

None. Both column additions are nullable, with no backfill.

## TBD

None.

Next stage: `api realness-score`.
