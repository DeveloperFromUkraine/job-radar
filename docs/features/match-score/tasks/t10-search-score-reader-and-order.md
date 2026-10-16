---
id: T10
title: "Give search a ScoreReader, the best-match order and a match on every posting"
layer: "app"
deps: ["T01"]
blocks: ["T11", "T12"]
acs: ["AC-02", "AC-11", "AC-15"]
files_hint: ["apps/server/src/modules/search/app/deps.ts", "apps/server/src/modules/search/app/search.ts", "apps/server/src/modules/search/app/pages.ts", "apps/server/src/modules/search/app/present.ts", "apps/server/src/modules/search/app/snapshots.ts", "apps/server/src/modules/search/domain/order.ts", "apps/server/src/modules/search/infra/repo.ts", "apps/server/src/modules/search/ports/routes.ts", "apps/server/src/app.ts", "apps/server/test/search-scores.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Give search a ScoreReader, the best-match order and a match on every posting

## Place in the sequence

- **Blocked by:** T01 — Promote the staged schema: the three matching tables and search_state.list_order · **Blocks:** T11 — Export the owner's list from search and show the last score in the marked view, T12 — Implement matching's score reader and scoring health · **Wave:** 2.
- **Lane:** shares `apps/server/src/modules/search/app/present.ts` with T11 — serialized; shares `apps/server/src/app.ts` with T15 — serialized.

## Why (user story)

> **As an** owner
> **I want** to switch the list to best match first and back to newest first
> **So that** I can work through the strongest fits without losing sight of fresh postings
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Search builds the list in either order with each posting's match, without a score ever changing which postings are in it.

## Inlined context

> **Chosen:** Option 1. The list is defined once, in search; matching reads it; search reads scores through an interface wired at the composition root, so no import cycle exists. Scores and the best-match order are taken when the snapshot is built, as remote-filter verdicts are (remote-filter ADR-0002). Option 2 leaves postings collected between visits unscored until the owner opens the screen, breaking the freshness NFR; option 3 duplicates the list rules, which would drift.
>
> — `adr/0004, Decision outcome, verbatim` · full text: [0004-read-scores-into-search-through-an-injected-reader-and-read-the-list-from-search.md](../adr/0004-read-scores-into-search-through-an-injected-reader-and-read-the-list-from-search.md)

> **Critical flow 2: loading the list in best-match order** (AC-02, AC-11, AC-15; ADR-0004)
>
> ```mermaid
> sequenceDiagram
>     actor Owner
>     participant Web as Web SPA
>     participant Search
>     participant Matching
>     participant DB as Local database
>
>     Owner->>Web: opens the main screen, order set to best match first
>     Web->>Search: run search with skills and the kept order
>     Search->>DB: open postings, marks, location verdicts as today
>     Search->>Matching: scores for the matching postings through the score reader
>     Matching->>DB: current scores and fingerprints
>     Matching-->>Search: per posting - score, parts, note, claims and state (scored, earlier version, pending, not scored - provider or key problem, cap reached, could not be scored, no profile)
>     Search->>Search: order - postings with no score newest first, then scores high to low, ties newest first
>     Search->>Search: fix order and scores in the snapshot, same total and counts as newest first
>     Search-->>Web: first 50 with their scores and states
>     Web-->>Owner: cards with score and note, or why there is none
>     Owner->>Web: asks for more
>     Web->>Search: next page of the same snapshot
>     Search-->>Web: next 50 in the fixed order, none repeated or skipped
> ```
>
> — `sad.md §6, Flow 2, verbatim` · full text: [sad.md](../sad.md)

> > The best-match order is fixed when the list is loaded, as the list itself is (search AC-16): a score that arrives later shows on its card but does not move the posting, and paging never repeats or skips a posting, until the owner refreshes the list. The default order for an owner who never chose is newest first.
>
> — `spec.md §5, AC-11 note, verbatim` · full text: [spec.md](../spec.md)

> - **F-3 (accepted, sequence gap → OQ):** if `runSearch` / `getNextPage` cannot read scores, they **fail open**. The list is built newest first with `match: null`, because a score only orders and never hides (AC-02, AC-12 "the list keeps working"). This is unlike marks and location settings, which fail closed. No §6 flow draws this branch. **OQ, owner `sequences`, due before `tasks`:** add an `alt scores unreadable` branch to flow 2.
>
> — `contracts/api-sync-report.md §Findings, F-3, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> 1. **A score never costs the owner a posting.** 0 postings left out of the list or its counts because of their score; every posting without a score says why (pending, not scored — provider or key problem, cap reached, could not be scored, no profile yet).
>
> — `sad.md §1, quality goal 1, verbatim` · full text: [sad.md](../sad.md)

> | Search response with scores | ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings, scores and a profile — unchanged from search, in either order | the search integration test, rerun with scores present and best match first |
>
> — `spec.md §6, NFR Search response with scores, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `search_state.list_order` | text | nullable; `newest` \| `best_match` checked in TypeScript | read and written (T01 adds it) |

— `data-model.md §Entities, search_state.list_order, verbatim` · full text: [data-model.md](../data-model.md)

## API contract

- `runSearch { skills, order? }` → `SearchResult` gains `order`, `has_profile`; each `Posting` gains `match: Match|null`. Counts identical in either order.
- `getNextPage` → items with `match` read fresh; the order is fixed.
- If scores cannot be read: newest first, `match: null` (fail-open, F-3).

— `contracts/openapi.yaml, operationIds runSearch / getNextPage, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-02 — domain invariant

> **Given** 40 postings match the owner's typed skills and the remote filter shows all 40, and 25 of them have scored below 30
> **When** the list is shown, in either order
> **Then** all 40 are in the list and in its total, each low-scored posting with its score and note; no posting leaves the list, and no count changes, because of its score
>
> > A score only orders and informs. Postings leave the list only through the typed skills (search), the remote filter, or a mark.
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy

> **Given** the owner's list holds 130 postings: 110 scored (5 of them against an earlier version of the posting), 15 pending, and 5 that could not be scored
> **When** the owner switches to best match first and asks for more twice
> **Then** they see first the 20 postings without a score, newest first, then the 110 scored postings — including those scored against an earlier version of the posting or of the profile, by their existing score and with their mark — from highest score to lowest (equal scores newest first), paged 50 at a time in the same order as one long list; switching back shows newest first again; the choice is kept for the next opening
>
> > The best-match order is fixed when the list is loaded, as the list itself is (search AC-16): a score that arrives later shows on its card but does not move the posting, and paging never repeats or skips a posting, until the owner refreshes the list. The default order for an owner who never chose is newest first.
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy

> **Given** the owner has not set up a profile
> **When** the owner opens the main screen
> **Then** the list works exactly as before — no scores and no "pending" marks on the cards, newest first — and one line above the list says there are no scores yet because no profile is set up, with one action to set one up, from a CV or by hand
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/app/deps.ts`: `ScoreReader { hasProfile(): boolean; matchesFor(ids): Map<id, Match>; listRead(): void }`
- [ ] `app.ts`: wire a no-profile stub (`hasProfile: false`) so search runs unchanged until T15 wires matching's (shared `app.ts` lane with T15)
- [ ] `search/domain/order.ts`: best-match order (no score newest first, then score desc, ties newest first)
- [ ] Snapshot keeps the order; `runSearch` saves `order` in `search_state.list_order` when given, else uses the kept one
- [ ] `present.ts`: `match` on items (fresh on every page), `order`, `has_profile`; fail-open when the reader throws
- [ ] Restate route schemas and contract pointers to `docs/features/match-score/contracts/openapi.yaml`
- [ ] `apps/server/test/search-scores.integration.test.ts` with a `fakeScoreReader` covering AC-11's 130 postings and AC-02's 40

## Edge cases

| Case | Behaviour |
|---|---|
| No profile | `has_profile: false`, every `match: null`, newest first (AC-15) |
| Score arrives after the snapshot | shows on its card on the next page read; order unchanged |
| Reader throws | newest first, `match: null`, no error |
| Equal scores | newest first |
| `order` omitted | the kept order; NULL → newest |

## Definition of Done

**Done when:** `search-scores.integration.test.ts` passes AC-11's order and paging over 130 postings, AC-02's 40 with 25 below 30 in both orders with identical counts, AC-15's no-profile list, and the fail-open case; the existing search tests stay green.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
