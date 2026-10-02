---
id: T28
title: "Clear each flag only on the evidence its AC names and ignore flags of sources that are not read"
layer: "domain"
deps: ["T27"]
blocks: ["T29"]
acs: ["AC-13", "AC-14", "AC-25", "AC-26"]
files_hint: ["apps/server/src/modules/collector/domain/health.ts", "apps/server/src/modules/collector/domain/health.test.ts", "apps/server/src/modules/collector/app/source-health.ts", "apps/server/src/modules/collector/app/finalize.ts", "apps/server/src/modules/collector/infra/sources/types.ts", "apps/server/test/collector-health-routes.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T28 — Clear each flag only on the evidence its AC names and ignore flags of sources that are not read

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **A5, C4**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-13, AC-14, AC-25, AC-26).

## Definition of Done

- [ ] tests: held_back clears only after a complete re-check, unknown_location only after a read with new listings, overdue measured from the last successful read with items, a rate-limited empty partial is not silent, flags of disabled / not-verified sources do not raise the marker
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
