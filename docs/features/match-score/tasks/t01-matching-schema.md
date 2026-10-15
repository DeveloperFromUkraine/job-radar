---
id: T01
title: "Promote the staged schema: the three matching tables and search_state.list_order"
layer: "migration"
deps: []
blocks: ["T05", "T10"]
acs: ["AC-10", "AC-11", "AC-12", "AC-18"]
files_hint: ["docs/features/match-score/migrations/", "apps/server/src/modules/matching/infra/schema.ts", "apps/server/src/modules/search/infra/schema.ts", "apps/server/drizzle/", "apps/server/test/matching-schema.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T01 — Promote the staged schema: the three matching tables and search_state.list_order

## Place in the sequence

- **Blocked by:** — · **Blocks:** T05 — Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction, T10 — Give search a ScoreReader, the best-match order and a match on every posting · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to edit my profile at any time and have scores follow the change
> **So that** the scores reflect what I am looking for now
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** scoring to stop at a monthly cap I can see
> **So that** job-radar never costs me more than I agreed to
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The tables every later task reads and writes: the profile and its version, one score per posting, the spend ledger, and the kept list order.

## Inlined context

> - SQLite through Drizzle. The new tables live in `apps/server/src/modules/matching/infra/schema.ts`, which matches the `drizzle.config.ts` glob `./src/modules/*/infra/schema.ts`. `search_state` gains one column in `search/infra/schema.ts`.
> - Names are snake_case with the module prefix `matching_`. sad.md §5 named two tables `match_scores` and `scoring_spend`. They are `matching_scores` and `matching_spend` here so that the prefix matches the module, as `tracking_marks` and `remote_filter_settings` do.
> - Text values that act like an enum (`kind`, `outcome`, `scoring_problem`, `list_order`) are checked in TypeScript, not by `CHECK`. There are no DB `DEFAULT`s, no triggers and no blanket audit columns. Rules live in `matching/domain`.
> - Times are integer UTC epoch milliseconds. Spend ids are UUIDv7 from `core/id.ts`. Scores are keyed by posting id.
> - Money is an integer number of **millionths of a dollar** (`*_usd_micros`). One scoring costs a few cents, and per-token prices go below a cent, so whole cents would round every attempt. Integers keep the cap comparison exact.
>
> — `data-model.md §Conventions, bullets, verbatim` · full text: [data-model.md](../data-model.md)

> 1. Write `apps/server/src/modules/matching/infra/schema.ts` to match staged 01–03. Use `text(…, { enum: [...] })` for `kind`, `outcome` and `scoring_problem`, `index("matching_spend_started_idx").on(t.startedAt)`, and `.references(() => postings.id, { onDelete: "cascade" })` as `tracking/infra/schema.ts` does. Add `listOrder: text("list_order", { enum: ["newest", "best_match"] })` to `search/infra/schema.ts`. The config glob already picks up the new module.
> 2. Run `pnpm --filter @job-radar/server db:generate`. All four staged files become one generated migration, which is expected.
> 3. Compare the resulting schema (`sqlite_master` / `pragma table_info`), not the SQL text. Add `test/matching-schema.integration.test.ts` like the search, tracking and remote-filter ones.
> 4. The `.down.sql` files are not promoted. They are manual rollbacks for a development database only. Real rollback restores the `*.bak-*` file.
>
> — `_audit/data-model-2026-10-15.md §Promote-time hint, verbatim` · full text: [data-model-2026-10-15.md](../_audit/data-model-2026-10-15.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table / column | Change |
|---|---|
| `matching_settings` (singleton: `profile`, `profile_version` NN, `profile_saved_at`, `cap_usd_micros` NN, `notice_agreed_at`, `last_success_at`, `scoring_problem`, `scoring_problem_at`) | created |
| `matching_scores` (`posting_id` PK FK → `collector_postings` ON DELETE CASCADE, `total`, four `*_part`, `note`, `claims`, `text_fingerprint`, `profile_version`, `scorer_version`, `scored_at`, `strike_count` NN, `strike_key`, `last_failure`, `last_failure_at`) | created |
| `matching_spend` (`id` PK, `kind` NN, `posting_id` no FK, `model` NN, `reserved_usd_micros` NN, `settled_usd_micros`, `outcome` NN, four token columns, `started_at` NN, `settled_at`) + `matching_spend_started_idx` | created |
| `search_state.list_order` text, nullable | added |

Staged pairs: `docs/features/match-score/migrations/01_create_matching_settings.*`, `02_create_matching_scores.*`, `03_create_matching_spend.*`, `04_add_search_list_order.*`.

— `data-model.md §Entities + §Migrations (staged), abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-10 — happy

> **Given** 60 postings in the owner's list have scores, and the owner changes their seniority from senior to staff and saves the profile
> **When** the owner returns to the list
> **Then** every existing score stays shown, marked "scored against your previous profile", until its posting is scored again; they are scored again newest first within the scoring cap (AC-12), after every posting that has no score at all; and "best match first" uses the new scores from the next time the list is loaded or refreshed (AC-11)
>
> > Only a saved change to a profile field makes scores stale: skills or their core / nice-to-have mark, years, seniority, role types, minimum salary or engagement forms. Saving with nothing changed, or changing the scoring cap, makes nothing stale.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy

> **Given** the owner's list holds 130 postings: 110 scored (5 of them against an earlier version of the posting), 15 pending, and 5 that could not be scored
> **When** the owner switches to best match first and asks for more twice
> **Then** they see first the 20 postings without a score, newest first, then the 110 scored postings — including those scored against an earlier version of the posting or of the profile, by their existing score and with their mark — from highest score to lowest (equal scores newest first), paged 50 at a time in the same order as one long list; switching back shows newest first again; the choice is kept for the next opening
>
> > The best-match order is fixed when the list is loaded, as the list itself is (search AC-16): a score that arrives later shows on its card but does not move the posting, and paging never repeats or skips a posting, until the owner refreshes the list. The default order for an owner who never chose is newest first.
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** the scoring cap is $5 and this calendar month's scoring and profile drafting have cost $4.98, counting failed attempts the provider charged for
> **When** the next posting is due for scoring
> **Then** no further scoring or profile drafting is started this month; postings that have no score show "not scored — monthly cap reached", and scores made against an earlier version of a posting or profile stay shown with their mark; the main screen shows that the scoring cap is reached and when scoring resumes (the first day of next month); the list, search, the remote filter and marks keep working unchanged
>
> > Spending is job-radar's own count: the usage the provider reports with each answer, priced at the model's stored price; an attempt that ends without an answer counts at its largest possible cost. The largest possible cost of an attempt is its input and output limits at that price, and no attempt is started unless it fits in what is left of the cap, so the month's spending never exceeds the cap. The month follows the owner's machine time zone, as the grace day does.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — error

> **Given** the provider answers for a posting on three consecutive attempts — in the same scoring pass or not — with something that is not a usable score: no number, a number outside 0 to 100, a missing part, a fit note over 40 words, or a refusal to handle the posting's text
> **When** the third answer arrives
> **Then** the posting shows "not scored — could not be scored" with the reason in plain language, stays in the list in its place, and is not tried again until the posting or the profile changes; all three attempts count against the scoring cap; scoring health shows how many postings could not be scored this month
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `matching/infra/schema.ts` (three tables, enums as `text(…, { enum })`, the index, the cascade FK)
- [ ] Add `listOrder` to `search/infra/schema.ts`
- [ ] Run `db:generate`; check the generated SQL creates the same schema as staged 01–04
- [ ] Add `apps/server/test/matching-schema.integration.test.ts`: `pragma table_info` per table, FK refusal for an unknown posting, cascade on posting delete, NOT NULL on `cap_usd_micros`
- [ ] Leave the staged `.down.sql` files in the feature folder (not promoted)

## Edge cases

| Case | Behaviour |
|---|---|
| Score for an unknown posting | insert fails `SQLITE_CONSTRAINT_FOREIGNKEY` |
| Collector deletes a posting | its `matching_scores` row goes with it (cascade) |
| Settings row inserted without the cap | `SQLITE_CONSTRAINT_NOTNULL`: the lazy upsert must write 5,000,000 |
| Existing `search_state` row | `list_order` reads NULL → newest first; no backfill |

## Definition of Done

**Done when:** The generated drizzle migration applies on a copy of a database at 0005, and `matching-schema.integration.test.ts` passes (columns, FK refusal, cascade, NOT NULL cap).

- [ ] the test(s) named above pass
- [ ] `pnpm --filter @job-radar/server db:migrate` backs up and applies on a real data file
- [ ] the staged migration is promoted (drizzle-generated) and applies on a copy of a real database
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
