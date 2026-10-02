---
id: T30
title: "Show a rate-limited fill as stopped and resume a fill from its saved cursor"
layer: "migration"
deps: ["T29"]
blocks: ["T31"]
acs: ["AC-19"]
files_hint: ["apps/server/src/modules/collector/infra/schema.ts", "apps/server/drizzle/", "apps/server/src/modules/collector/app/first-fill.ts", "apps/server/test/collector-first-fill.integration.test.ts", "apps/server/test/collector-e2e.integration.test.ts", "apps/web/src/features/source-health/SourceCard.tsx"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "done"
---

# T30 — Show a rate-limited fill as stopped and resume a fill from its saved cursor

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **B12, C10 (fill NFR test)**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-19).

## Definition of Done

- [ ] tests: with no spare read the fill is recorded as limited with no next-part time; a later part resumes from the saved cursor; the fill NFR scenario pages a source that really pages
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
