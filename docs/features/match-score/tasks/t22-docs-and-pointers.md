---
id: T22
title: "Update the docs: SAD table names and flow 2, contract pointers, design-system inventory, roadmap and key setup"
layer: "docs"
deps: ["T21"]
blocks: []
acs: ["AC-14"]
files_hint: ["docs/features/match-score/sad.md", "docs/features/remote-filter/contracts/openapi.yaml", "docs/features/applied-skipped/contracts/openapi.yaml", "docs/design-system.md", "docs/roadmap.md", "README.md"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T22 — Update the docs: SAD table names and flow 2, contract pointers, design-system inventory, roadmap and key setup

## Place in the sequence

- **Blocked by:** T21 — Prove the invariants and NFRs end to end, and add the real-model evaluation run · **Blocks:** — · **Wave:** 7.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** every posting without a score to say why, and scoring problems to show where source problems show
> **So that** I never mistake a missing score for a bad fit, and I notice when scoring has stopped
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Leaves the next reader with docs that match what was built, and the owner with the key and spending-limit setup.

## Inlined context

> - sad.md §5 still says `match_scores` / `scoring_spend`. The tables are `matching_scores` / `matching_spend` (data-model audit). This contract uses no table names in paths, so nothing here changes. sad.md §5 still needs the rename.
>
> — `contracts/api-sync-report.md §Carried over, table names, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> - **F-3 (accepted, sequence gap → OQ):** if `runSearch` / `getNextPage` cannot read scores, they **fail open**. The list is built newest first with `match: null`, because a score only orders and never hides (AC-02, AC-12 "the list keeps working"). This is unlike marks and location settings, which fail closed. No §6 flow draws this branch. **OQ, owner `sequences`, due before `tasks`:** add an `alt scores unreadable` branch to flow 2.
>
> — `contracts/api-sync-report.md §Findings, F-3, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> No new deployment unit: the `matching` module and its background scorer run in the existing server process on the owner's machine, started on the server's ready hook and stopped through an abort signal on close, as the collector is (ADR-0001, ADR-0003). One new migration adds the three matching tables and the order field on `search_state`; it runs with the existing `db:migrate`, which backs up the database first. New configuration, read once at start: the provider key from the `ANTHROPIC_API_KEY` environment variable (the SDK's standard source; never in the repository, never shown or logged), the model id and the price table (defaults for `claude-opus-5-5`: $4 input, $20 output, $0.20 cache read per million tokens, plus the cache-write price from the provider's price list, checked in `implement`), and the scorer's concurrency (default 1). Without a key the feature runs in its AC-14 state ("not scored", reason shown); nothing else breaks. Deployment checklist gains: set the key, and set a spending limit in the provider account as the backstop for a leaked key (spec §6.1).
>
> — `sad.md §7, Deployment view, verbatim` · full text: [sad.md](../sad.md)

> > Timeouts, rate limits, an unreachable provider and key problems are provider problems: the posting stays pending and does not count towards AC-18. The provider key is set only in the owner's local configuration, outside the repository, and never on screen.
>
> — `spec.md §5, AC-14 note, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. Adds "superseded by match-score" pointers to the remote-filter and applied-skipped contracts for runSearch, getNextPage, runMarkedView and getNextMarkedPage.

## Acceptance criteria

### AC-14 — error

> **Given** the provider is unreachable, refuses job-radar's key, or no key is set up
> **When** scoring is due
> **Then** postings without a current score show "not scored" with the reason in plain language; scoring health shows the problem with the reason and when scoring last succeeded; the main-screen problem marker shows; nothing is hidden; and scoring picks up by itself, newest first and within the cap: after an unreachable or rate-limited provider, it is tried again at most every 15 minutes; after a missing or refused key, it is tried again when job-radar is restarted with a key
>
> > Timeouts, rate limits, an unreachable provider and key problems are provider problems: the posting stays pending and does not count towards AC-18. The provider key is set only in the owner's local configuration, outside the repository, and never on screen.
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `sad.md` §5: `match_scores` → `matching_scores`, `scoring_spend` → `matching_spend`; flow 2: `alt scores unreadable` branch (F-3)
- [ ] Supersede pointers in the two earlier contracts
- [ ] `docs/design-system.md`: register the ten new components and the four extended ones
- [ ] `docs/roadmap.md`: step 4 status
- [ ] README / deployment checklist: set `ANTHROPIC_API_KEY` locally, never in the repo; set a spending limit in the provider account

## Edge cases

| Case | Behaviour |
|---|---|
| Key missing at start | README says where it is read and that scoring shows "not scored" until restart with a key (AC-14) |

## Definition of Done

**Done when:** The SAD, both earlier contracts, the design-system inventory, the roadmap and the README are updated, and every Mermaid block in `sad.md` still renders.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
