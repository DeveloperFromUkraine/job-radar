---
id: T39
title: "Close the round-5 review findings in merge"
layer: "domain"
deps: ["T38"]
blocks: []
acs: ["AC-04", "AC-11"]
files_hint: ["apps/server/src/modules/collector/domain/merge.ts", "apps/server/src/modules/collector/domain/merge.test.ts", "apps/server/src/modules/collector/infra/repo/postings.ts", "apps/server/src/modules/collector/app/ingest.ts", "apps/server/src/modules/collector/app/first-fill.ts", "apps/server/test/collector-ingest.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "done"
---

# T39 — Close the round-5 review findings in merge

Follow-up from the round-5 re-review. The findings and the agreed fixes are the brief:
[`_review/review-2026-10-03-r5.md`](../_review/review-2026-10-03-r5.md), items **P1, P2, P3**. ACs quoted verbatim in
[`spec.md`](../spec.md) §5 (AC-04, AC-11).

## Definition of Done

- [x] tests: a closed listing already seen in this run (`lastSeenRunId === runId`) and absent from the fetch is not proven gone, so its sibling re-post attaches (P1; the seen-in-run check moves above the closed shortcut)
- [x] tests: the N1 unit test uses a closed posting and expects `attach` with `reopen: true` (P2)
- [x] tests: an integration test in which a closed item is returned after its sibling re-post. Assert that the old listing row keeps its id and `first_collected_at`, both listings are open, and the posting is open under the same id (P2)
- [x] tests: an expired, still-open listing that this fetch does not return counts as proven gone, so its re-post replaces it. An expired listing that the fetch does return is not proven gone (P3; `expiresAt` on the candidate listing, `now` on `Presence`)
- [x] a red test is written and seen failing before each code fix (TDD)
- [x] lint + vet clean (`pnpm lint`, `tsc`)
