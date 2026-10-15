---
id: T05
title: "Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction"
layer: "infra"
deps: ["T01", "T04"]
blocks: ["T08", "T09", "T12", "T13"]
acs: ["AC-12", "AC-19"]
files_hint: ["apps/server/src/modules/matching/infra/repo.ts", "apps/server/test/matching-repo.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T05 — Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction

## Place in the sequence

- **Blocked by:** T01 — Promote the staged schema: the three matching tables and search_state.list_order, T04 — Write the spend rules: largest possible cost, settled cost from usage, month boundary and cents rounding · **Blocks:** T08 — Implement the settings use cases: read settings, save profile, agree to the notice, set the cap, T09 — Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV, T12 — Implement matching's score reader and scoring health, T13 — Implement one scoring attempt: reserve, ask, validate, store or strike, settle · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** scoring to stop at a monthly cap I can see
> **So that** job-radar never costs me more than I agreed to
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The only code that reads and writes the matching tables, including the reservation that makes overspend impossible.

## Inlined context

> **Chosen:** Option 1. The check and the reservation happen in one synchronous transaction on the only connection, so two attempts cannot both pass the check. The ledger survives restarts and feeds scoring health (spend this month, failures) and the spending KPI. The largest possible cost is an upper bound, not an estimate: the request's input bounded from its size in UTF-8 bytes (counted as one token per byte, a bound no byte-level tokenizer exceeds), priced at the cache-write rate, plus its output limit at the output rate. Settlement prices every usage figure the answer reports — uncached input, cache writes, cache reads and output.
>
> — `adr/0006, Decision outcome, verbatim` · full text: [0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage.md](../adr/0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage.md)

> **Month's spend:** `SUM(COALESCE(settled_usd_micros, reserved_usd_micros)) WHERE started_at >= <month start>`.
>
> — `data-model.md §Entities, matching_spend, verbatim` · full text: [data-model.md](../data-model.md)

> | `matching_spend_started_idx` | `matching_spend(started_at)` | The month's spend. It is summed inside the reservation transaction before **every** attempt (flows 1, 5, 6, 7) and for scoring health (flow 9). The plan is `SEARCH … USING INDEX (started_at>?)`. Without the index, a ledger kept for years would be scanned on every attempt. |
>
> — `data-model.md §Indexes, matching_spend_started_idx, verbatim` · full text: [data-model.md](../data-model.md)

> None. The settings row is upserted lazily with `profile_version = 0` and `cap_usd_micros = 5_000_000`, in code, like the other singletons. There is no lookup data. Seniority, role types and engagement forms are fixed lists in `matching/domain` (CONTEXT: Profile), not tables.
>
> — `data-model.md §Seeds, lazy upsert, verbatim` · full text: [data-model.md](../data-model.md)

> **Persistence:** Drizzle schema per module in `<module>/infra/schema.ts`; queries only inside `infra/`. Business rules live in `domain/`, not in the DB.
>
> — `CLAUDE.md §Conventions, Persistence, verbatim` · full text: [CLAUDE.md](../../../../CLAUDE.md)

> 2. **Spending stays within the owner's cap.** The month's scoring and profile drafting never exceed the scoring cap (default $5); 0 attempts started after the cap is reached.
>
> — `sad.md §1, quality goal 2, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Reads and writes every column of `matching_settings`, `matching_scores` and `matching_spend` (T01). The month's spend uses `matching_spend_started_idx`.

— `data-model.md §Entities, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-12 — domain invariant

> **Given** the scoring cap is $5 and this calendar month's scoring and profile drafting have cost $4.98, counting failed attempts the provider charged for
> **When** the next posting is due for scoring
> **Then** no further scoring or profile drafting is started this month; postings that have no score show "not scored — monthly cap reached", and scores made against an earlier version of a posting or profile stay shown with their mark; the main screen shows that the scoring cap is reached and when scoring resumes (the first day of next month); the list, search, the remote filter and marks keep working unchanged
>
> > Spending is job-radar's own count: the usage the provider reports with each answer, priced at the model's stored price; an attempt that ends without an answer counts at its largest possible cost. The largest possible cost of an attempt is its input and output limits at that price, and no attempt is started unless it fits in what is left of the cap, so the month's spending never exceeds the cap. The month follows the owner's machine time zone, as the grace day does.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy

> **Given** this month's scoring has stopped at the $5 cap on the 20th
> **When** the owner raises the scoring cap to $8 in the profile editor
> **Then** scoring resumes at once, newest first, until this month's spending reaches $8; lowering the cap below what is already spent stops scoring until next month, and a cap of $0 pauses scoring; the cap can be set from $0 to $100
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `readSettings` (lazy upsert: `profile_version` 0, `cap_usd_micros` 5,000,000), `saveProfile`, `saveCap`, `agreeNotice` (keeps the first time), `setProblem` / `clearProblem`, `setLastSuccess`
- [ ] `scoresFor(ids)`, `upsertScore`, `addStrike`, `couldNotScoreCountSince`
- [ ] `reserve({ kind, postingId, model, cost, cap, monthStart })`: one synchronous `db.transaction` that sums the month and inserts the reservation only if it fits; returns the id or `cap_reached`
- [ ] `settle(id, usage, cost, outcome)` and `markNoAnswer(id)`; `monthSpend(monthStart)`
- [ ] `apps/server/test/matching-repo.integration.test.ts` with `seedSpend` / `seedScores` / `seedProfile` fixtures in `test/helpers/matching-fixtures.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Two reservations near the cap back to back | the second is refused: the check and insert are one transaction |
| Reservation never settled (crash) | counts at its reserved maximum in the month's sum |
| `agreeNotice` twice | keeps the first `notice_agreed_at` |
| Settings read on an empty DB | row created with version 0 and $5 cap |

## Definition of Done

**Done when:** `matching-repo.integration.test.ts` passes: the lazy upsert, reserve refusal at $4.98/$5, two back-to-back reservations, settle/no-answer sums and the score upsert/strike round trip.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
