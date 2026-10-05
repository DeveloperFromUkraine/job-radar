# Tracker — search-postings

> Status of every task in the epic. `implement` marks a task `done` when it commits it.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Promote the search_state schema: Drizzle schema.ts + generated migration 0003 | migration | Volodymyr Kozlov | S | — | done |
| T2 | Parse and check the owner's skills (split, trim, dedupe, AC-05 rules) | domain | Volodymyr Kozlov | S | — | done |
| T3 | Match skills against posting text with exact-text boundaries and in-title flags | domain | Volodymyr Kozlov | M | — | done |
| T4 | Implement effective-time ordering, the visit/new-mark rule and the safe-link check | domain | Volodymyr Kozlov | M | — | done |
| T5 | Add the collector's read-only open-postings export (stream, after-moment, by id) | infra | Volodymyr Kozlov | M | — | done |
| T6 | Keep search state and record visits (repo + openVisit / heartbeat use cases) | app | Volodymyr Kozlov | S | T1, T4 | done |
| T7 | Run a search: save skills, scan open postings, order, mark new, keep an in-memory snapshot | app | Volodymyr Kozlov | M | T2, T3, T4, T5, T6 | todo |
| T8 | Serve next pages from a snapshot and count waiting postings | app | Volodymyr Kozlov | S | T7 | todo |
| T9 | Expose the four search routes and wire the module on one shared DB handle | ports | Volodymyr Kozlov | M | T8 | todo |
| T10 | Prove the NFRs end to end: 10k-posting latency, currency, paging under a live run, late arrivals | tests | Volodymyr Kozlov | M | T9 | todo |
| T11 | Add the typed search API client, the TanStack queries and the SkillsField component | ui | Volodymyr Kozlov | M | — | todo |
| T12 | Build PostingCard (matched skills, time, per-source links) and the Badge `new` tone | ui | Volodymyr Kozlov | M | — | todo |
| T13 | Compose SCR-01: visit, skills search, summary line and the list's loading/empty/error states | ui | Volodymyr Kozlov | M | T11, T12 | todo |
| T14 | Add show more, the waiting notice with Refresh, the expired-list reload; register new components | ui | Volodymyr Kozlov | M | T13 | todo |

**Total:** 14 tasks, about 7–8 person-days (S ≈ ½ day, M ≈ ¾ day). The critical path is T1/T4 → T6 → T7 → T8 → T9 → T10.
