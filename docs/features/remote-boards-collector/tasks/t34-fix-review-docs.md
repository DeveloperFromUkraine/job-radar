---
id: T34
title: "Record the review decisions in spec, SAD, ADR-0004 and screens"
layer: "docs"
deps: ["T33"]
blocks: []
acs: ["AC-21", "AC-22"]
files_hint: ["docs/features/remote-boards-collector/spec.md", "docs/features/remote-boards-collector/sad.md", "docs/features/remote-boards-collector/adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md", "docs/features/remote-boards-collector/screens.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T34 — Record the review decisions in spec, SAD, ADR-0004 and screens

Follow-up from the review of 2026-10-02. The finding text, the cited `file:line` and the agreed resolution
are the brief: [`_review/review-2026-10-02.md`](../_review/review-2026-10-02.md), items **B9, B11, C3**.
The ACs it restores are quoted verbatim in [`spec.md`](../spec.md) §5 (AC-21, AC-22).

## Definition of Done

- [ ] spec AC-22 note on Jobicy "Anywhere"; ADR-0004 addendum; sad §11 Himalayas search cannot filter by category with the risk re-rated; screens.md: stacked cards at every width and the 60 s idle refresh
- [ ] a red test is written and seen failing before the fix (TDD)
- [ ] every Hard Rule of the original tasks still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
