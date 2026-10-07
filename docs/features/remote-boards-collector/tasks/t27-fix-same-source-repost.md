---
id: T27
title: "Replace a same-source item only when the old one is gone and locations agree"
layer: "domain"
deps: ["T26"]
blocks: ["T28"]
acs: ["AC-05", "AC-04", "AC-12", "AC-25"]
files_hint: ["apps/server/src/modules/collector/domain/merge.ts", "apps/server/src/modules/collector/domain/merge.test.ts", "apps/server/src/modules/collector/infra/repo/postings.ts", "apps/server/test/collector-ingest.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "done"
---

# T27 — Replace a same-source item only when the old one is gone and locations agree

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **A2**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-05, AC-04, AC-12, AC-25).

## Definition of Done

- [ ] unit + integration tests: two live same-title items with different stated locations stay two postings and stop flipping between runs; a real re-post (old item gone) still replaces
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
