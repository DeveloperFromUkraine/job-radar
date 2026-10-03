---
id: T37
title: "Close the round-3 review findings in code and tests"
layer: "app"
deps: ["T36"]
blocks: []
acs: ["AC-05", "AC-04", "AC-11", "AC-14", "AC-18"]
files_hint: ["apps/server/src/modules/collector/domain/merge.ts", "apps/server/src/modules/collector/domain/merge.test.ts", "apps/server/src/modules/collector/infra/repo/postings.ts", "apps/server/src/modules/collector/app/finalize.ts", "apps/server/test/collector-ingest.integration.test.ts", "apps/server/test/collector-finalize.integration.test.ts", "apps/server/test/collector-run-start.integration.test.ts", "apps/server/src/modules/collector/index.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T37 — Close the round-3 review findings in code and tests

Follow-up from the round-3 re-review. The findings, their `file:line` and the agreed fixes are the brief:
[`_review/review-2026-10-03-r3.md`](../_review/review-2026-10-03-r3.md), items **S1, M1, L1, L2, L3**. ACs quoted verbatim in
[`spec.md`](../spec.md) §5 (AC-05, AC-04, AC-11, AC-14, AC-18).

## Definition of Done

- [ ] tests: a same-source item whose stated location conflicts never replaces the old item (`merge.test.ts` :137-148 and :208-215 flipped to `create`; integration: complete Remotive fetch, US item gone, Germany item posted → two postings)
- [ ] tests: on a capped source, an old listing that is already closed counts as proven gone, so a same-location re-post replaces it instead of attaching a second listing from the same source
- [ ] tests: finalize clears `held_back` for Himalayas after a capped run ≤ 30% and keeps it for Jobicy / Remotive after a capped run
- [ ] tests: the R4 start-up test makes only the heartbeat fail after `startUp`, asserts `start()` resolves and the error reaches `onError` (or is renamed to what it checks)
- [ ] tests: a shutdown during a run is logged at info ("run interrupted by shutdown"), never as "run failed"
- [ ] a red test is written and seen failing before each code fix (TDD)
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
