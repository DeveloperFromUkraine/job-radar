---
id: T25
title: "Keep a failing run from staying running and a failing fill from faking a source failure"
layer: "app"
deps: ["T24"]
blocks: ["T26"]
acs: ["AC-03", "AC-08", "AC-15", "AC-16", "AC-18", "AC-19"]
files_hint: ["apps/server/src/modules/collector/app/run-pipeline.ts", "apps/server/src/modules/collector/index.ts", "apps/server/test/collector-pipeline-failures.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T25 — Keep a failing run from staying running and a failing fill from faking a source failure

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **A3, A4, C10 (pipeline-failure tests)**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-03, AC-08, AC-15, AC-16, AC-18, AC-19).

## Definition of Done

- [ ] integration tests: a throwing finalize leaves the run incomplete and the next run starts; a throwing fill keeps one complete verdict, the outcome unchanged and no failing flag; a throwing ingest fails that source only
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
