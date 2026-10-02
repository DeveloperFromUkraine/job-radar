---
id: T31
title: "Move app-layer SQL into infra and keep id lists under SQLite's variable limit"
layer: "infra"
deps: ["T30"]
blocks: ["T32"]
acs: []
files_hint: ["apps/server/src/modules/collector/app/cleanup.ts", "apps/server/src/modules/collector/app/first-fill.ts", "apps/server/src/modules/collector/infra/repo/"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "done"
---

# T31 — Move app-layer SQL into infra and keep id lists under SQLite's variable limit

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **C1, C2**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (no AC — code quality).

## Definition of Done

- [ ] no drizzle query builders in app/; listings of open postings fetched by subquery; id lists chunked; a test closes and removes more ids than one chunk
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
