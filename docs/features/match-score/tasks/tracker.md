# Tracker — match-score

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | Promote the staged schema: the three matching tables and search_state.list_order | migration | Volodymyr Kozlov | S | — | done |
| T02 | Write the profile rules: fixed lists, field checks, contact detection, change detection and salary periods | domain | Volodymyr Kozlov | M | — | done |
| T03 | Write the score rules: total with fixed weights, answer validation, text fingerprint, staleness and the match state | domain | Volodymyr Kozlov | M | — | done |
| T04 | Write the spend rules: largest possible cost, settled cost from usage, month boundary and cents rounding | domain | Volodymyr Kozlov | S | — | done |
| T05 | Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction | infra | Volodymyr Kozlov | M | T01, T04 | done |
| T06 | Add the Claude client: SDK, configuration, fixed output schemas, usage, error classes and a stand-in provider | infra | Volodymyr Kozlov | M | T02, T03 | done |
| T07 | Extract CV text locally from PDF, Word (.docx) and plain text, with the AC-08 refusals | infra | Volodymyr Kozlov | M | — | done |
| T08 | Implement the settings use cases: read settings, save profile, agree to the notice, set the cap | app | Volodymyr Kozlov | M | T02, T05 | done |
| T09 | Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV | app | Volodymyr Kozlov | M | T02, T04, T05, T06, T07 | done |
| T10 | Give search a ScoreReader, the best-match order and a match on every posting | app | Volodymyr Kozlov | L | T01 | done |
| T11 | Export the owner's list from search and show the last score in the marked view | app | Volodymyr Kozlov | S | T10 | done |
| T12 | Implement matching's score reader and scoring health | app | Volodymyr Kozlov | M | T03, T05, T10, T11 | done |
| T13 | Implement one scoring attempt: reserve, ask, validate, store or strike, settle | app | Volodymyr Kozlov | M | T03, T04, T05, T06 | done |
| T14 | Run the background scorer: polling, wake-ups, queue order, retry cadence, start and stop | app | Volodymyr Kozlov | M | T11, T13 | todo |
| T15 | Expose matching's routes and wire the module into app.ts | ports | Volodymyr Kozlov | M | T08, T09, T12, T14 | todo |
| T16 | Show the match on every card: API types, ScoreBadge and MatchSummary in the main list and the marked view | ui | Volodymyr Kozlov | M | — | done |
| T17 | Add the order switch, the no-profile and cap-reached line, and scoring problems in the marker | ui | Volodymyr Kozlov | M | T16 | done |
| T18 | Add the scoring health card to the source health screen | ui | Volodymyr Kozlov | S | T16 | done |
| T19 | Build the profile screen: route, AppNav link, ProfileForm, DataNotice and CapField | ui | Volodymyr Kozlov | L | T16 | done |
| T20 | Add CV upload and the draft review to the profile screen | ui | Volodymyr Kozlov | M | T19 | done |
| T21 | Prove the invariants and NFRs end to end, and add the real-model evaluation run | tests | Volodymyr Kozlov | M | T15, T17 | todo |
| T22 | Update the docs: SAD table names and flow 2, contract pointers, design-system inventory, roadmap and key setup | docs | Volodymyr Kozlov | S | T21 | todo |

**Total:** 22 tasks, ~19.5 person-days.
