---
id: T33
title: "Settings fallback in the contract, SCR-02 polling and the remaining screen fixes"
layer: "ui"
deps: ["T32"]
blocks: ["T34"]
acs: ["AC-27", "AC-12", "AC-15", "AC-16", "AC-23", "AC-24"]
files_hint: ["docs/features/remote-boards-collector/contracts/openapi.yaml", "docs/features/remote-boards-collector/contracts/api-sync-report.md", "apps/server/src/modules/collector/app/source-health.ts", "apps/web/src/"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T33 — Settings fallback in the contract, SCR-02 polling and the remaining screen fixes

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **A6, A7, A8, C7, C8, C9**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-27, AC-12, AC-15, AC-16, AC-23, AC-24).

## Definition of Done

- [ ] contract + component tests: running_on last_valid | defaults rendered; SCR-02 polls every 60 s when idle and 2 s during a run; Collect now disabled while loading; a 409 refreshes source health; notice badge tone; rounded-card token
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
