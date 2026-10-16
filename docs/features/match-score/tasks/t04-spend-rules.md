---
id: T04
title: "Write the spend rules: largest possible cost, settled cost from usage, month boundary and cents rounding"
layer: "domain"
deps: []
blocks: ["T05", "T09", "T13"]
acs: ["AC-12", "AC-19"]
files_hint: ["apps/server/src/modules/matching/domain/spend.ts", "apps/server/src/modules/matching/domain/spend.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T04 — Write the spend rules: largest possible cost, settled cost from usage, month boundary and cents rounding

## Place in the sequence

- **Blocked by:** — · **Blocks:** T05 — Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction, T09 — Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV, T13 — Implement one scoring attempt: reserve, ask, validate, store or strike, settle · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** scoring to stop at a monthly cap I can see
> **So that** job-radar never costs me more than I agreed to
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The arithmetic that guarantees the month's spending never exceeds the cap.

## Inlined context

> **Chosen:** Option 1. The check and the reservation happen in one synchronous transaction on the only connection, so two attempts cannot both pass the check. The ledger survives restarts and feeds scoring health (spend this month, failures) and the spending KPI. The largest possible cost is an upper bound, not an estimate: the request's input bounded from its size in UTF-8 bytes (counted as one token per byte, a bound no byte-level tokenizer exceeds), priced at the cache-write rate, plus its output limit at the output rate. Settlement prices every usage figure the answer reports — uncached input, cache writes, cache reads and output.
>
> — `adr/0006, Decision outcome, verbatim` · full text: [0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage.md](../adr/0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage.md)

> > Spending is job-radar's own count: the usage the provider reports with each answer, priced at the model's stored price; an attempt that ends without an answer counts at its largest possible cost. The largest possible cost of an attempt is its input and output limits at that price, and no attempt is started unless it fits in what is left of the cap, so the month's spending never exceeds the cap. The month follows the owner's machine time zone, as the grace day does.
>
> — `spec.md §5, AC-12 note, verbatim` · full text: [spec.md](../spec.md)

> No new deployment unit: the `matching` module and its background scorer run in the existing server process on the owner's machine, started on the server's ready hook and stopped through an abort signal on close, as the collector is (ADR-0001, ADR-0003). One new migration adds the three matching tables and the order field on `search_state`; it runs with the existing `db:migrate`, which backs up the database first. New configuration, read once at start: the provider key from the `ANTHROPIC_API_KEY` environment variable (the SDK's standard source; never in the repository, never shown or logged), the model id and the price table (defaults for `claude-opus-5-5`: $4 input, $20 output, $0.20 cache read per million tokens, plus the cache-write price from the provider's price list, checked in `implement`), and the scorer's concurrency (default 1). Without a key the feature runs in its AC-14 state ("not scored", reason shown); nothing else breaks. Deployment checklist gains: set the key, and set a spending limit in the provider account as the backstop for a leaked key (spec §6.1).
>
> — `sad.md §7, Deployment view, verbatim` · full text: [sad.md](../sad.md)

> | Time | Calendar month in the machine's time zone (`machineTimeZone()` in `core/config.ts`), as the grace day | `core/config.ts` |
>
> — `sad.md §8, Time, verbatim` · full text: [sad.md](../sad.md)

> - Money is an integer number of **millionths of a dollar** (`*_usd_micros`). One scoring costs a few cents, and per-token prices go below a cent, so whole cents would round every attempt. Integers keep the cap comparison exact.
>
> — `data-model.md §Conventions, money unit, verbatim` · full text: [data-model.md](../data-model.md)

> | Spending | the month's scoring and profile drafting never exceed the scoring cap (default $5); 0 attempts started after the cap is reached | unit test over the cap rule with charged failures; monthly spend shown in scoring health |
>
> — `spec.md §6, NFR Spending, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. (Values for `matching_spend.reserved_usd_micros` / `settled_usd_micros` and `matching_settings.cap_usd_micros`.)

## API contract

`spent_usd_cents` and `cap_usd_cents` are whole cents; spend is rounded **up** to the cent.

— `contracts/openapi.yaml, schema UsdCents, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

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

- [ ] `maxCost(requestBytes, outputLimit, price)`: input bytes as tokens at the cache-write rate + output limit at the output rate, in micros (ADR-0006)
- [ ] `settledCost(usage, price)`: uncached input, cache writes, cache reads and output each at its rate
- [ ] `fits(spent, reserved, cost, cap)` and `monthStart(now, timeZone)` / `nextMonthStart` (machine time zone)
- [ ] `toCentsUp(micros)`
- [ ] `domain/spend.test.ts`: the AC-12 $4.98 case refuses any attempt costing more than 2 cents, a $0 cap refuses all, month boundary in Europe/Warsaw around DST

## Edge cases

| Case | Behaviour |
|---|---|
| $4.98 spent, cap $5, attempt max 3¢ | does not fit: no attempt starts (AC-12) |
| Cap lowered below spend | nothing fits until next month (AC-19) |
| Cap $0 | nothing fits: paused |
| Attempt ended without an answer | counts at its reserved maximum |

## Definition of Done

**Done when:** `spend.test.ts` passes, including the AC-12 $4.98 refusal, the $0 pause and the month boundary in the machine time zone.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
