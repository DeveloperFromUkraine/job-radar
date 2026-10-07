---
id: T35
title: "Close the round-2 review findings in code and tests"
layer: "app"
deps: ["T34"]
blocks: ["T36"]
acs: ["AC-05", "AC-04", "AC-14", "AC-13", "AC-18", "AC-19", "AC-20", "AC-15", "AC-27"]
files_hint: ["apps/server/src/modules/collector/domain/merge.ts", "apps/server/src/modules/collector/app/", "apps/server/src/modules/collector/domain/health.ts", "apps/server/src/modules/collector/infra/http.ts", "apps/server/src/modules/collector/index.ts", "apps/server/test/", "apps/web/src/features/source-health/CollectNow.test.tsx", "docs/features/remote-boards-collector/contracts/openapi.yaml"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "done"
---

# T35 — Close the round-2 review findings in code and tests

Follow-up from the round-2 re-review. The findings, their `file:line` and the agreed fixes are the brief:
[`_review/review-2026-10-02-r2.md`](../_review/review-2026-10-02-r2.md), items **R1, R2, R3, R4, R6, R7, R8, R9, R10**. ACs quoted verbatim in
[`spec.md`](../spec.md) §5 (AC-05, AC-04, AC-14, AC-13, AC-18, AC-19, AC-20, AC-15, AC-27).

## Definition of Done

- [ ] tests: a capped Himalayas read never replaces a live same-title role with a different location; held_back survives a capped Jobicy/Remotive run; the heartbeat error reaches onError; the overdue reason names a failed read truthfully; no ledger read after shutdown; shutdown logged at info; the pipeline fill catch is exercised; the idle-poll test has margins; contract examples show limited and running_on
- [ ] a red test is written and seen failing before each code fix (TDD)
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
