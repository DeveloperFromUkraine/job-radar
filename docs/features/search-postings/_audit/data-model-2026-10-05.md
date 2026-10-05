# Audit — data-model — search-postings — 2026-10-05

## Staged migrations

The migrations are staged and are not yet in the live `apps/server/drizzle/` tree. `implement` promotes them.

| Ordinal | Up | Down | Creates |
|---|---|---|---|
| 01 | `docs/features/search-postings/migrations/01_create_search_state.up.sql` | `…/01_create_search_state.down.sql` | `search_state` (singleton) |

The collector schema is unchanged: no ALTER, no new index, so no expand/backfill/contract is needed.

## Promote-time hint

Promotion follows the same drizzle-kit flow as the collector (project ADR-0003). The live tree ends at `0002_stale_prodigy`, so the next number is about `0003`. drizzle-kit assigns the real number when it generates the file, and another feature, such as roadmap step 11, may promote first.

1. Write `apps/server/src/modules/search/infra/schema.ts` to match the staged SQL. The existing config glob already picks it up.
2. Run `pnpm --filter @job-radar/server db:generate`.
3. Compare the resulting schema (`sqlite_master`), not the SQL text.
4. The `.down.sql` is not promoted. It is a manual rollback for a development database only. Real rollback means restoring the `*.bak-*` file.

## Verification (better-sqlite3 on Node 22, in-memory, `foreign_keys = ON`)

- Ran live `0001` and `0002`, then staged up. Applying up twice is idempotent. Down restores the pre-up schema exactly. Up again gives an identical schema.
- A double `insert … on conflict do nothing` for `id = 1` leaves one row, which matches the lazy-upsert pattern.
- Seeded 40,000 postings (about 27k open, 3 KB descriptions) and recorded `EXPLAIN QUERY PLAN` and p95 for each collector read search makes. Results are in `data-model.md` §Indexes: stream 270 ms (full scan by design), waiting count 3.9 ms, page by id 0.9 ms.

## Self-check

| Check | Result |
|---|---|
| Naming follows the convention | Pass. snake_case, `search_` module prefix, singleton `id` like `collector_state` |
| Down reversibility | Pass. CREATE TABLE ↔ DROP TABLE, verified by schema diff |
| FK indexes | Pass, trivially. `search_state` has no FK |
| Convention adherence | Pass. Epoch-ms integers, JSON text list, no CHECK/DEFAULT/trigger, no audit columns, lazy upsert instead of a seed |

## Index decisions

- **Discarded:** `collector_postings(first_found_at)` for the flow-2 waiting count, which sad.md §6 flagged for a check. It measured 3.9 ms p95 without the index, so the index is not worth a write on every posting insert. Revisit if the poll shows up in `durationMs`.
- **No index can help** the open-postings stream, which reads everything by design (ADR-0002). The 270 ms read time at about 27k open postings leaves 730 ms of the 1 s QG-2 budget for matching. That is worth watching against sad.md §11 risk 1, which forecasts 20–40k listings.

## Drift

- `search`: no domain layer exists yet, so there is nothing to compare.
- `collector`: `infra/schema.ts` matches the live `0001` + `0002` SQL (all tables, columns, nullability and indexes). No `_drift/` fixes.

## Seeds

None. The singleton row is upserted at runtime. Test fixtures are listed in `data-model.md`, with no PII (`example.test`).

## Deviations / TBD

None.

Next stage: `/sdd:api search-postings`.
