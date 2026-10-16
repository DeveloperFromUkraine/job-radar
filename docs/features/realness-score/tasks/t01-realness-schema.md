---
id: T01
title: "Promote the staged schema: pay_field, reopened_at and the three realness tables"
layer: "migration"
deps: []
blocks: ["T05", "T06", "T07"]
acs: ["AC-06", "AC-08", "AC-10", "AC-14"]
files_hint: ["docs/features/realness-score/migrations/01_add_collector_listing_pay_field.up.sql", "docs/features/realness-score/migrations/01_add_collector_listing_pay_field.down.sql", "docs/features/realness-score/migrations/02_add_collector_posting_reopened_at.up.sql", "docs/features/realness-score/migrations/02_add_collector_posting_reopened_at.down.sql", "docs/features/realness-score/migrations/03_create_realness_settings.up.sql", "docs/features/realness-score/migrations/03_create_realness_settings.down.sql", "docs/features/realness-score/migrations/04_create_realness_mark_records.up.sql", "docs/features/realness-score/migrations/04_create_realness_mark_records.down.sql", "docs/features/realness-score/migrations/05_create_realness_daily_shares.up.sql", "docs/features/realness-score/migrations/05_create_realness_daily_shares.down.sql", "apps/server/src/modules/collector/infra/schema.ts", "apps/server/src/modules/realness/infra/schema.ts", "apps/server/drizzle/", "apps/server/test/realness-schema.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T01 — Promote the staged schema: pay_field, reopened_at and the three realness tables

## Place in the sequence

- **Blocked by:** nothing — can start at once · **Blocks:** T05 — Keep each board's pay field on every fetch and the reopening time in the collector, T06 — Export the realness facts from collector/app: reopening, pay fields, closed heads, pay-field boards, T07 — Add the realness module with its switch: settings repo, GET/POST /api/v1/realness/settings, registration · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** owner
> **I want** postings with realness signals to sit lower in the best-match order than postings with a similar fit and no signals
> **So that** I spend my applications on roles that are still being filled
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task gives the collector somewhere to keep the two new facts (pay field, reopening time) and realness its three tables, so every later task has a schema to read and write.

## Inlined context

> - SQLite through Drizzle. The new tables live in `apps/server/src/modules/realness/infra/schema.ts`, matching the `drizzle.config.ts` glob. The two collector columns go in `collector/infra/schema.ts`.
> - snake_case names with the module prefix `realness_`. Enum-like text (`mark`) is checked in TypeScript, not by `CHECK`. There are no DB `DEFAULT`s, no triggers and no blanket audit columns. Booleans are `integer` (`mode: "boolean"` in Drizzle), as `remote_filter_settings.filter_on` is.
> - Times are integer UTC epoch milliseconds. Rows are keyed by posting id or calendar day, so no new ids are needed.
>
> — `data-model.md, conventions, verbatim` · full text: [data-model.md](../data-model.md)

> Staged under `docs/features/realness-score/migrations/`, not in `apps/server/drizzle/`. `implement` adds the columns and tables to the Drizzle schemas, runs `db:generate` (expected next number `0007`), and checks that the generated SQL matches these files.
>
> — `data-model.md §Migrations (staged), verbatim` · full text: [data-model.md](../data-model.md)

> No new deployment unit. [...] One new migration (`0007`) adds the two collector columns and the three realness tables. It runs with the existing `db:migrate`, which backs up the database first.
>
> — `sad.md §7, Deployment view, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table.column | Type | Null | Change |
|---|---|---|---|
| `collector_listings.pay_field` | text | yes | added — `""` = board states nothing / has no field; NULL = not read since this shipped |
| `collector_postings.reopened_at` | integer (epoch ms) | yes | added — NULL = not reopened since this shipped |
| `realness_settings.id` | integer PK | no | new table — always 1 |
| `realness_settings.realness_on` | integer (boolean) | no | new — no row = never chosen = on |
| `realness_mark_records.posting_id` | text PK, FK → `collector_postings.id` ON DELETE CASCADE | no | new table |
| `realness_mark_records.mark` / `penalty` / `signals` / `recorded_at` | text / integer / text (JSON) / integer | no | new — `applied`\|`skipped`, 0–30, `[]` = none |
| `realness_daily_shares.day` | text PK (`YYYY-MM-DD`) | no | new table |
| `realness_daily_shares.postings` / `lowered` / `recorded_at` | integer | no | new |

— `data-model.md §Entities, all five changes, abridged` · full text: [data-model.md](../data-model.md)

Staged pairs (promoted by this task into `apps/server/drizzle/` via `db:generate`):
`migrations/01_add_collector_listing_pay_field.{up,down}.sql` · `02_add_collector_posting_reopened_at` · `03_create_realness_settings` · `04_create_realness_mark_records` · `05_create_realness_daily_shares`.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 — domain invariant

> **Given** a posting states its pay — any of its open listings from an enabled source has an amount in its board's own pay field, or the title or description of any of those listings gives an amount of money as pay, such as "$120k", "120–150K USD", "PLN 20 000–25 000 net B2B", "18 000 zł/mies.", "€60,000 a year" or "30k/month"
> **When** job-radar works out its realness signals
> **Then** the posting has no "no salary" signal; wording without an amount ("competitive", "DOE", "attractive package", "market rate") counts as no stated salary, and amounts that are not pay ("$5M Series A", "$2,000 learning budget", "$1B ARR") are never read as a salary; a listing whose pay state is unknown (collected before this shipped and not fetched since, §1) on a board that has a pay field counts as stating pay until its next fetch
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — cross-context

> **Given** the collector reopened a posting after it had closed (a reopening since this shipped), or the owner's collection holds an earlier, closed posting (marked or not) that matches this posting by the look-alike matching rule (company and title as in CONTEXT "Look-alike posting", applied here to any earlier posting, not only a marked one), whose time as search orders it (publication time, never later than first found) is more than 7 days before this posting's
> **When** job-radar works out the posting's realness signals
> **Then** it has the repost signal; a posting merged from listings within 7 days of each other (collector AC-04) is one posting and is not a repost; two copies collected on the same day in the first fill, published more than 7 days apart, are a repost; a posting whose earlier copy was already removed by clean-up has no repost signal; while the earlier matching posting is still open, the two are read as parallel hires and neither has the repost signal; a look-alike posting keeps its look-alike hint (applied-skipped) next to the reason line
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — happy

> **Given** realness is on
> **When** the owner switches it off
> **Then** best match first orders by match score alone (match-score AC-11), no card in either order shows a "Lowered" or a "Signals" line, and the choice is kept for the next opening; switching it on again restores the penalty and the reason lines at once; realness is on when the owner first opens the list after this ships
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy

> **Given** a posting in the owner's list, with realness on or off and in either order
> **When** the owner marks it applied or skipped
> **Then** job-radar keeps, with the mark, the posting's penalty and signals at that moment as realness would work them out with the switch on, so the §7 checks can compare marks on lowered and not-lowered postings; the first time the owner opens the list on a calendar day of their time zone, it also keeps the share of postings in that list that had a penalty, counted on the list as the owner's saved skills and remote filter give it (a one-off look is ignored); a day the list is not opened has no share; changing the mark keeps the record of the latest mark only, and clearing the mark removes its record
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `payField: text("pay_field")` (nullable) to `collector_listings` and `reopenedAt: integer("reopened_at")` (nullable) to `collector_postings` — `apps/server/src/modules/collector/infra/schema.ts`
- [ ] Create `apps/server/src/modules/realness/infra/schema.ts` with `realness_settings`, `realness_mark_records` (FK cascade to `collector_postings.id`) and `realness_daily_shares`, following `remote-filter/infra/schema.ts`
- [ ] Run `pnpm --filter server db:generate`; confirm one new file `apps/server/drizzle/0007_*.sql` and diff it against the staged `01`–`05` up files (column names, types, nullability, FK)
- [ ] Write `apps/server/test/realness-schema.integration.test.ts` against a temp SQLite file (`test/helpers/temp-db.ts`)

## Edge cases

| Case | Behaviour |
|---|---|
| A listing row that existed before the migration | `pay_field` reads NULL (unknown), not `""` |
| A posting row that existed before the migration | `reopened_at` reads NULL |
| Deleting a posting that has a mark record | the `realness_mark_records` row is deleted with it (cascade) |
| A second share insert for the same `day` | rejected by the PK (the app uses `INSERT OR IGNORE`) |
| Mark record for a posting id that does not exist | refused by the FK |

## Definition of Done

- [ ] staged migration is promoted to live `apps/server/drizzle/0007_*.sql`, applies on a copy of a 0006 database and the file backup runs first
- [ ] `realness-schema.integration.test.ts` passes: nullable new columns, cascade, PKs
- [ ] `down` files still drop exactly what `up` added (manual dev rollback only)
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
