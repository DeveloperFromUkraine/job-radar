---
id: T29
title: "Check owner categories against the published lists of Jobicy and Remotive"
layer: "domain"
deps: ["T28"]
blocks: ["T30"]
acs: ["AC-24"]
files_hint: ["apps/server/src/modules/collector/domain/sources.ts", "apps/server/src/modules/collector/app/finalize.ts", "apps/server/test/collector-finalize.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T29 — Check owner categories against the published lists of Jobicy and Remotive

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **B10**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-24).

## Definition of Done

- [ ] integration test: a category missing from Remotive's published list is flagged in the first run, without 7 days of history
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
