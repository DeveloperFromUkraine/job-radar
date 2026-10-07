---
id: T38
title: "Close the round-4 review findings in merge"
layer: "domain"
deps: ["T37"]
blocks: []
acs: ["AC-04", "AC-11"]
files_hint: ["apps/server/src/modules/collector/domain/merge.ts", "apps/server/src/modules/collector/domain/merge.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "done"
---

# T38 — Close the round-4 review findings in merge

Follow-up from the round-4 re-review. The findings and the agreed fixes are the brief:
[`_review/review-2026-10-03-r4.md`](../_review/review-2026-10-03-r4.md), items **N1, N2**. ACs quoted verbatim in
[`spec.md`](../spec.md) §5 (AC-04, AC-11).

## Definition of Done

- [x] tests: a closed old listing that this fetch still returns is never proven gone, so its sibling re-post attaches instead of replacing it (N1; `provenGone` checks `fetchedItemIds` before the closed shortcut)
- [x] tests: the capped-no-proof test at `merge.test.ts:276` is renamed to what it checks (an AC-05 location conflict), N2
- [x] a red test is written and seen failing before the code fix (TDD)
- [x] lint + vet clean (`pnpm lint`, `tsc`)
