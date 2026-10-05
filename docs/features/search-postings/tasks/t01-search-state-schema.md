---
id: T1
title: "Promote the search_state schema: Drizzle schema.ts + generated migration 0003"
layer: "migration"
deps: []
blocks: ["T6"]
acs: ["AC-13", "AC-14"]
files_hint: ["apps/server/src/modules/search/infra/schema.ts", "apps/server/drizzle/", "docs/features/search-postings/migrations/01_create_search_state.up.sql", "docs/features/search-postings/migrations/01_create_search_state.down.sql", "apps/server/test/search-schema.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
# measured inlined lines: 53
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T1 — Promote the search_state schema: Drizzle schema.ts + generated migration 0003

## Place in the sequence

- **Blocked by:** — · **Blocks:** T6 — Keep search state and record visits · **Wave:** 1 (no deps).
- **Lane:** migration lane (serialized by `implement`); no other task touches `search/infra/schema.ts` or `apps/server/drizzle/`.

## Why (user story)

> **As an** owner
> **I want** job-radar to remember the skills I searched last
> **So that** opening the app shows my list straight away without retyping
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** postings collected since my previous visit to be marked new, with their count shown
> **So that** I don't miss a role a slower source delivered late, below postings I already read
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Gives search its one persistent row: the last skills and the visit times.

## Inlined context

> - SQLite through Drizzle. The table lives in `apps/server/src/modules/search/infra/schema.ts`. It matches the existing `drizzle.config.ts` glob `./src/modules/*/infra/schema.ts`, so no config change is needed.
> - Names are snake_case with the module prefix `search_`.
> - A singleton state row uses `id integer PK` and is always `1`, the same as `collector_state`. The row is upserted lazily with `onConflictDoNothing`, so there is no seed migration.
> - Times are integer UTC epoch milliseconds. A list value is stored as JSON text, the same as `collector_listings.categories`.
> - There are no `CHECK` constraints, no DB `DEFAULT`s, no triggers and no blanket audit columns. Rules live in `search/domain`.
>
> — `data-model.md` intro, conventions list, verbatim · full text: [data-model.md](../data-model.md)

> **Migrations:** `db:generate` after a schema change; forward-only. `db:migrate` backs up the SQLite file first — rollback = restore that `*.bak-*` file.
>
> — `CLAUDE.md` §Conventions, Migrations, verbatim

The collector's schema is **unchanged** — no new column and no new index on `collector_postings` / `collector_listings` (`data-model.md §Indexes`).

**Fallback:** insufficient or contradicted by the code → read the named file in full
([data-model.md](../data-model.md) · [sad.md](../sad.md)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `id` | integer | PK | added — always `1` |
| `last_skills` | text | | added — JSON array of the last skills that passed the AC-05 check; `NULL` = none (AC-13) |
| `visit_started_at` | integer | | added — current visit start (AC-14) |
| `visit_last_seen_at` | integer | | added — heartbeat; >30 min gap starts a new visit |
| `previous_visit_started_at` | integer | | added — "new" = first collected after this; `NULL` on the first visit |

— `data-model.md §Entities, search_state, abridged` · full text: [data-model.md](../data-model.md)

Staged pair (reference SQL the generated migration must equal):
`docs/features/search-postings/migrations/01_create_search_state.up.sql` / `01_create_search_state.down.sql`.
The live migration is **generated** by `pnpm --filter @job-radar/server db:generate` into `apps/server/drizzle/` (next is `0003_*`), as the collector did.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-13 — happy

> **Given** the owner last searched for "React, Go" and closed the app
> **When** the owner opens the main screen again
> **Then** the skills field holds "React, Go" and the list is a fresh search for them; after the owner clears the skills and searches, the next opening starts with an empty field
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy

> **Given** the owner's previous visit to the main screen started yesterday at 09:00, and since then the collector added postings — including one published two days ago that a slower source delivered this morning
> **When** the owner opens the main screen
> **Then** every posting first collected after yesterday 09:00 is marked new — the late one included, in its publication-time position — and the screen shows how many of the listed postings are new
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

This task only provides the storage; the behaviour is asserted by T6/T7.

## Checklist

- [ ] Define `searchState` (`search_state`) in `apps/server/src/modules/search/infra/schema.ts` per the Data delta.
- [ ] Run `pnpm --filter @job-radar/server db:generate`; commit the generated `apps/server/drizzle/0003_*.sql` + `meta/`.
- [ ] `apps/server/test/search-schema.integration.test.ts`: on `createTempDb()`, assert `search_state`'s columns/types/PK equal the staged `01_create_search_state.up.sql` (compare `PRAGMA table_info`).

## Edge cases

| Case | Behaviour |
|---|---|
| Existing DB with collector tables | Migration adds only `search_state`; collector tables untouched |
| Fresh DB | `0000`–`0003` apply in order; no seed row (lazy upsert in T6) |

## Definition of Done

- [ ] `drizzle-kit` generates `0003_*` from `search/infra/schema.ts`; the integration test proves it equals the staged reference SQL
- [ ] `createTempDb()` (all migrations) still passes every existing test
- [ ] no change to `collector/infra/schema.ts`
- [ ] lint + vet clean
