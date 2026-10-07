---
id: T36
title: "Add the limited fill state to the runtime and UX flows"
layer: "docs"
deps: ["T35"]
blocks: []
acs: ["AC-19"]
files_hint: ["docs/features/remote-boards-collector/sad.md", "docs/features/remote-boards-collector/ux-flows.md", "docs/features/remote-boards-collector/migrations/01_create_sources.up.sql"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "done"
---

# T36 — Add the limited fill state to the runtime and UX flows

Follow-up from the round-2 re-review. The findings, their `file:line` and the agreed fixes are the brief:
[`_review/review-2026-10-02-r2.md`](../_review/review-2026-10-02-r2.md), items **R5**. ACs quoted verbatim in
[`spec.md`](../spec.md) §5 (AC-19).

## Definition of Done

- [ ] sad Flow 8 and ux-flows US-06 show the limited branch; the staged migration comment lists limited; mermaid blocks parse
- [ ] a red test is written and seen failing before each code fix (TDD)
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
