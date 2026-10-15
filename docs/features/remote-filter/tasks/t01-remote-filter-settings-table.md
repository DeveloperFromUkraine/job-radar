---
id: T01
title: "Create the remote_filter_settings table and promote its staged migration"
layer: "migration"
deps: []
blocks: ["T06"]
acs: ["AC-04", "AC-07"]
files_hint: ["docs/features/remote-filter/migrations/01_create_remote_filter_settings.up.sql", "docs/features/remote-filter/migrations/01_create_remote_filter_settings.down.sql", "apps/server/src/modules/remote-filter/infra/schema.ts", "apps/server/drizzle/", "apps/server/test/remote-filter-schema.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T01 — Create the remote_filter_settings table and promote its staged migration

## Place in the sequence

- **Blocked by:** — · **Blocks:** T06 — Write the settings repo with the lazy singleton row · **Wave:** 1 (no deps, starts at once).
- **Lane:** own lane (`layer: migration` is serialized by `implement` anyway).

## Why (user story)

> **As an** owner
> **I want** to choose my country once and have job-radar remember it
> **So that** the filter works every time I open the list
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The one table that makes the owner's country, the on/off state and a one-off look survive a restart.

## Inlined context

> Same drizzle-kit flow as the collector, search and tracking (project ADR-0003). The live tree ends at `0004_tricky_sunfire`, so the next number is about `0005`. drizzle-kit assigns the real number and name when it generates the file, and another wave-4 feature (roadmap steps 4, 10) may promote first.
> 1. Write `apps/server/src/modules/remote-filter/infra/schema.ts` to match the staged SQL. Use `filterOn: integer("filter_on", { mode: "boolean" }).notNull()`. The config glob already picks it up.
> 2. Run `pnpm --filter @job-radar/server db:generate`.
> 3. Compare the resulting schema (`sqlite_master` / `pragma table_info`), not the SQL text. Add `test/remote-filter-schema.integration.test.ts` like the search and tracking ones.
> 4. The `.down.sql` is not promoted. It is a manual rollback for a development database only; real rollback restores the `*.bak-*` file.
>
> — `_audit/data-model-2026-10-14.md §Promote-time hint, verbatim` · full text: [_audit](../_audit/data-model-2026-10-14.md)

> - `pragma table_info`: `id INTEGER NN PK, country TEXT, filter_on INTEGER NN, look_country TEXT, look_started_at INTEGER`.
> - Inserting a row without `filter_on` fails with `SQLITE_CONSTRAINT_NOTNULL`. The lazy upsert must write `filter_on`.
>
> — `_audit/data-model-2026-10-14.md §Verification, abridged` · full text: [_audit](../_audit/data-model-2026-10-14.md)

> - Names are snake_case with the module prefix `remote_filter_`.
> - A singleton state row uses `id integer PK`, always `1`, upserted lazily with `onConflictDoNothing`, so there is no seed migration.
> - Booleans are `integer` in Drizzle's boolean mode (as `collector_run_sources.is_first_fill`). Times are integer UTC epoch milliseconds.
> - There are no `CHECK` constraints, no DB `DEFAULT`s, no triggers and no audit columns. Rules live in `remote-filter/domain`.
>
> — `data-model.md §Conventions, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** Datastore: one SQLite file through `better-sqlite3` + Drizzle ORM; migrations from `drizzle-kit`, forward-only, with a file backup before each migrate (project ADR `docs/adr/0003-sqlite-with-drizzle.md`).
>
> — `sad.md §2, Technical, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Staged pair: `docs/features/remote-filter/migrations/01_create_remote_filter_settings.up.sql` / `…down.sql` (promoted by `implement` into `apps/server/drizzle/` through `db:generate`).

| Column | Type | Constraints | Change |
|---|---|---|---|
| `id` | integer | PK | added — always `1` |
| `country` | text | nullable | added — ISO 3166-1 alpha-2; `NULL` = not chosen yet (AC-04) |
| `filter_on` | integer (boolean) | NOT NULL | added — written `true` with the row (AC-07) |
| `look_country` | text | nullable | added — one-off look; `NULL` = no look (AC-06) |
| `look_started_at` | integer | nullable | added — epoch ms the look started |

— `data-model.md §Entities, remote_filter_settings, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-04 — happy

> **Given** the owner has never chosen a country
> **When** they open the main screen, choose Poland, and later close and reopen the app
> **Then** before choosing they see every open posting with a prompt to choose their country; after choosing, the list is filtered for Poland; on reopening, Poland is still chosen and the filter is still on
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy

> **Given** the filter for Poland hides 38 of 140 open postings that match the owner's skills
> **When** the list is shown
> **Then** the owner sees "102 postings — 38 hidden, not open to Poland", pages through those 102 (search AC-15), and has one action to switch the filter off; switching it off shows all 140 without any "check" or hidden distinction, and the filter stays off on the next opening until the owner switches it on, with the screen saying the location filter is off and offering to switch it on
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

This task delivers only the persistence half of both ACs (the row survives a restart); the behaviour is T07/T10.

## Checklist

- [ ] `apps/server/src/modules/remote-filter/infra/schema.ts` — `remoteFilterSettings` table matching the staged up.sql
- [ ] `pnpm --filter @job-radar/server db:generate` → new file under `apps/server/drizzle/` (+ `meta/`)
- [ ] `apps/server/test/remote-filter-schema.integration.test.ts` — `pragma table_info` matches; insert without `filter_on` fails

## Edge cases

| Case | Behaviour |
|---|---|
| Migrate run twice | Idempotent; no error, schema unchanged |
| Row inserted without `filter_on` | `SQLITE_CONSTRAINT_NOTNULL` |
| Another wave-4 feature promoted first | Take the next free number drizzle-kit assigns; never renumber a live file |

## Definition of Done

**Done when:** drizzle-kit generates the next migration from `remote-filter/infra/schema.ts`, and `remote-filter-schema.integration.test.ts` shows on a temp DB the five columns of the staged SQL and the NOT NULL failure on `filter_on`.

- [ ] `remote-filter-schema.integration.test.ts` passes
- [ ] staged migration promoted to live `apps/server/drizzle/`, applies on a temp DB; `.down.sql` reverts it on a dev DB
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
