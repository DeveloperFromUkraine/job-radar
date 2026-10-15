---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-15"
feature_size: "M"
ticket: "roadmap step 4"
---

# 0006 — Reserve the largest possible cost before each attempt and settle from usage

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

The month's scoring and profile drafting must never exceed the scoring cap, counting attempts the provider charged for even when they failed (spec AC-12, AC-19, NFR Spending). Spending is job-radar's own count from the usage each answer reports, priced at a stored price (clarify 2026-10-15). Two things can spend at once: the background scorer and a CV draft started by the owner.

## Decision drivers

- Spec NFR Spending: never exceed the cap; 0 attempts after it is reached.
- Spec AC-12 note: an attempt that ends without an answer counts at its largest possible cost — its input and output limits at the stored price.
- §2: one SQLite connection, synchronous transactions on one event loop.

## Considered options

1. **Reserve and settle in a ledger.** Before each attempt, one transaction checks spent + reserved + this attempt's largest possible cost ≤ cap and writes a reservation row; when the answer arrives, the row is settled to usage × price; with no answer it stays at the reserved amount.
2. **An in-memory counter behind a lock,** saved as one number.

## Decision outcome

**Chosen:** Option 1. The check and the reservation happen in one synchronous transaction on the only connection, so two attempts cannot both pass the check. The ledger survives restarts and feeds scoring health (spend this month, failures) and the spending KPI. The largest possible cost is an upper bound, not an estimate: the request's input bounded from its size in UTF-8 bytes (counted as one token per byte, a bound no byte-level tokenizer exceeds), priced at the cache-write rate, plus its output limit at the output rate. Settlement prices every usage figure the answer reports — uncached input, cache writes, cache reads and output.

## Consequences

**Positive**
- Overspend is impossible by construction, including for crashes mid-attempt.
- One record per attempt: auditable against the provider's bill.

**Negative**
- The stored price can drift from the provider's price list; the provider-side spending limit is the backstop (spec §6.1).
- A few cents of cap can stay unused near the limit, because reservations are worst-case.

**Neutral**
- The month boundary follows the machine's time zone (`core/config.ts` `machineTimeZone`).

## Links

- Spec: [[../spec.md]] AC-12, AC-14, AC-19, §6, §6.1
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0002-score-with-claude-opus-5-5-at-low-effort]], [[0003-score-one-posting-at-a-time-with-the-messages-api-in-a-background-scorer]]
