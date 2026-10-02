---
id: T32
title: "Keep the heartbeat during long runs and abort in-flight reads on shutdown"
layer: "app"
deps: ["T31"]
blocks: ["T33"]
acs: ["AC-13", "AC-20"]
files_hint: ["apps/server/src/modules/collector/app/scheduler.ts", "apps/server/src/modules/collector/index.ts", "apps/server/src/modules/collector/infra/http.ts", "apps/server/src/modules/collector/app/first-fill.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T32 — Keep the heartbeat during long runs and abort in-flight reads on shutdown

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **C5, C6**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-13, AC-20).

## Definition of Done

- [ ] tests: heartbeat advances while a run is busy; closing the app aborts an in-flight slow read quickly and the run is incomplete at next start
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
