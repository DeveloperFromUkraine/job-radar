---
id: T1
title: "Promote the collector schema: Drizzle schema.ts + generated migration 0001"
layer: "migration"
deps: []
blocks: ["T10", "T11", "T13"]
acs: ["AC-16"]
files_hint: ["apps/server/src/modules/collector/infra/schema.ts", "apps/server/drizzle/", "docs/features/remote-boards-collector/migrations/", "apps/server/test/collector-schema.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 50
status: "done"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T1 — Promote the collector schema: Drizzle schema.ts + generated migration 0001

## Place in the sequence

- **Blocked by:** nothing — starts in wave 0 · **Blocks:** T10 — Read, create and fall back on the settings file, persisting the last valid copy, T11 — Build the ledgered HTTP client and the Jobicy adapter, T13 — Run the one-minute scheduler, start-up recovery and run opening · **Wave:** 0 (no prerequisites).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to start a collection myself
> **So that** I don't wait for the schedule after fixing a problem or before a job-hunting session
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Creates the ten collector tables every other task reads and writes; the partial unique index is the database backstop for AC-16.

## Inlined context

> - SQLite through Drizzle; tables live in `apps/server/src/modules/collector/infra/schema.ts`.
> - Table and column names in snake_case with the module prefix `collector_`; Drizzle properties in camelCase.
> - IDs: UUIDv7 text generated in the app (`newId()`), except `collector_sources.id`, a source code from the adapter registry, and the singleton `collector_state.id = 1`.
> - Times: integer UTC epoch milliseconds (sad.md §8). Calendar dates in the owner's time zone are `YYYY-MM-DD` text.
> - Status-like values are TEXT checked by TypeScript enums and domain rules — no `CHECK` constraints, no DB `DEFAULT`s, no triggers. FKs, `UNIQUE` and one partial unique index are used.
> - No blanket `created_at` / `updated_at`: a time column exists only where a rule reads it.
> - Hard delete: retention removes rows (AC-10).
> - Owner marks are not stored here — the collector asks the `MarkedPostings` port (ADR-0006).
>
> — `data-model.md §preamble, conventions, verbatim` · full text: [data-model.md](../data-model.md)

> 1. Write `apps/server/src/modules/collector/infra/schema.ts` matching the staged SQL. Use Drizzle `uniqueIndex(...).on(t.status).where(sql\`status = 'running'\`)` for the partial index and `integer({ mode: "boolean" })` for `is_first_fill`.
> 2. Run `pnpm --filter @job-radar/server db:generate`, which writes one `0001_*.sql`.
> 3. Compare the **resulting schema**, not the SQL text: apply both to temporary databases and diff `sqlite_master`. drizzle-kit omits `IF NOT EXISTS` and orders statements differently.
> 4. The `.down.sql` files are **not promoted**. They are a manual rollback for a development database. The repo's rollback is still "restore the `*.bak-*` file `db:migrate` takes before migrating".
>
> — `_audit/data-model-2026-10-02.md §Promote-time hint, steps 1–4, verbatim` · full text: [data-model audit](../_audit/data-model-2026-10-02.md)

> - **Persistence:** Drizzle schema per module in `<module>/infra/schema.ts`; queries only inside `infra/`.
>   Business rules live in `domain/`, not in the DB.
> - **Migrations:** `db:generate` after a schema change; forward-only. `db:migrate` backs up the SQLite file
>   first — rollback = restore that `*.bak-*` file.
>
> — `CLAUDE.md §Conventions, Persistence + Migrations, verbatim` · full text: [CLAUDE.md](../../../../CLAUDE.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Staged pair | Creates |
|---|---|
| `migrations/01_create_sources.up.sql` / `.down.sql` | `collector_sources`, `collector_source_disabled_periods`, `collector_request_ledger`, `collector_source_flags` + 2 indexes |
| `migrations/02_create_runs.up.sql` / `.down.sql` | `collector_runs`, `collector_run_sources` + `collector_runs_one_running_uq` (partial unique), `collector_run_sources_source_run_idx` |
| `migrations/03_create_postings.up.sql` / `.down.sql` | `collector_postings`, `collector_listings` + 3 indexes |
| `migrations/04_create_collector_state.up.sql` / `.down.sql` | `collector_state`, `collector_app_sessions` |

— `data-model.md §Entities + _audit §Staged migrations, abridged` · full text: [data-model.md](../data-model.md) · column-level truth: the staged `.up.sql` files

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-16 — domain invariant

> **Given** a collection run is already in progress
> **When** the owner asks to collect now
> **Then** no second run starts and the owner is told a run is already in progress
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `apps/server/src/modules/collector/infra/schema.ts` table by table from the staged `.up.sql` files: snake_case columns, camelCase properties, `integer` epoch-ms times, `integer({ mode: "boolean" })` for `is_first_fill`, FKs with the same `ON DELETE` behaviour — `apps/server/src/modules/collector/infra/schema.ts`
- [ ] Declare `collector_runs_one_running_uq` with `uniqueIndex(...).on(t.status).where(sql\`status = 'running'\`)` — `schema.ts`
- [ ] Run `pnpm --filter @job-radar/server db:generate`; commit the generated `apps/server/drizzle/0001_*.sql` and the updated `meta/` snapshot + journal — `apps/server/drizzle/`
- [ ] Integration test: migrate one temp DB with `runMigrations`, apply the staged `01…04 .up.sql` to a second; compare `sqlite_master` names, `pragma table_info`, `pragma index_list`/`index_info` (+ partial `WHERE`), `pragma foreign_key_list` — `apps/server/test/collector-schema.integration.test.ts`
- [ ] Same test: a second `running` run is rejected; deleting a posting cascades to its listings

## Edge cases

| Case | Behaviour |
|---|---|
| drizzle-kit emits SQL text that differs from the staged file (quoting, order, no `IF NOT EXISTS`) | Not a failure — compare the resulting schema, not text |
| A second run inserted with status `running` | Rejected by `collector_runs_one_running_uq` (`SQLITE_CONSTRAINT_UNIQUE`) |
| Listing for a source id not in `collector_sources` | Rejected by the FK (`foreign_keys = ON` in `core/db.ts`) |
| Rollback needed | Restore the `*.bak-*` file `db:migrate` wrote — the staged `.down.sql` files are dev-only and are not promoted |

## Definition of Done

- [ ] `0001_*.sql` + snapshot generated by drizzle-kit and committed
- [ ] schema-equivalence integration test passes against a real temp SQLite file
- [ ] one-running-run and cascade assertions pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
