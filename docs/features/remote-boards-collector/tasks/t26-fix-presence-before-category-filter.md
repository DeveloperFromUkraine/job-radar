---
id: T26
title: "Mark every fetched item as seen before the category filter"
layer: "app"
deps: ["T25"]
blocks: ["T27"]
acs: ["AC-23", "AC-07", "AC-14"]
files_hint: ["apps/server/src/modules/collector/app/ingest.ts", "apps/server/src/modules/collector/infra/repo/postings.ts", "apps/server/test/collector-finalize.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T26 — Mark every fetched item as seen before the category filter

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **A1**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-23, AC-07, AC-14).

## Definition of Done

- [ ] integration test: removing a category from settings closes nothing and raises no hold-back flag while the source still offers those items
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
