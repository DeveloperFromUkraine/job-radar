# Tracker — applied-skipped

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Create the tracking_marks table and promote its staged migration](./t01-tracking-marks-table.md) | migration | Volodymyr Kozlov | S | — | done |
| T02 | [Write the mark state machine, undo guard and grace day as pure domain functions](./t02-mark-state-machine-and-grace-day.md) | domain | Volodymyr Kozlov | M | — | done |
| T03 | [Write the look-alike key and winning-mark rule, on the collector's exported merge normalization](./t03-look-alike-key.md) | domain | Volodymyr Kozlov | S | — | done |
| T04 | [Rename the collector's marks port to ProtectedPostings.protectedAmong and record ADR-0006 as partly superseded](./t04-rename-port-to-protected-postings.md) | app | Volodymyr Kozlov | S | — | done |
| T05 | [Add the collector's read-only exports: postings by id including closed, and the retention outlook](./t05-collector-read-exports.md) | app | Volodymyr Kozlov | M | — | done |
| T06 | [Write the tracking repo: guarded mark writes, undo, and the mark reads every flow needs](./t06-marks-repo.md) | infra | Volodymyr Kozlov | M | T01, T02 | done |
| T07 | [Implement the mark, change, clear and undo use cases with their error mapping and MarkState](./t07-mark-use-cases.md) | app | Volodymyr Kozlov | M | T05, T06 | todo |
| T08 | [Implement ProtectedPostings in tracking and wire it into the collector in app.ts](./t08-protected-postings-port.md) | app | Volodymyr Kozlov | S | T04, T06 | todo |
| T09 | [Implement tracking's read queries for search: marked ids, the marked order, and look-alike hints](./t09-mark-queries-and-hints.md) | app | Volodymyr Kozlov | M | T03, T05, T06 | todo |
| T10 | [Expose setMark and undoMark as Fastify routes behind the access guard and register the tracking plugin](./t10-tracking-routes.md) | ports | Volodymyr Kozlov | S | T07, T08 | todo |
| T11 | [Make search's main list mark-aware: snapshot keeps marked, pages skip them, counts and hints](./t11-search-main-list-with-marks.md) | app | Volodymyr Kozlov | M | T08, T09 | todo |
| T12 | [Add search's marked view: a fixed-order marked snapshot with skills, closed and cleared postings](./t12-search-marked-view.md) | app | Volodymyr Kozlov | M | T11 | todo |
| T13 | [Add the web tracking client, the MarkActions component and PostingCard's look-alike line, marked variant and actions slot](./t13-web-client-markactions-postingcard.md) | ui | Volodymyr Kozlov | M | — | todo |
| T14 | [Wire marking and the 8-second Undo notice into the main list](./t14-web-mark-and-undo.md) | ui | Volodymyr Kozlov | M | T13 | todo |
| T15 | [Show the save-error, posting-gone and nothing-left-to-review states on the main screen](./t15-web-save-error-gone-nothing-left.md) | ui | Volodymyr Kozlov | S | T14 | todo |
| T16 | [Build the Show marked postings switch and the marked view with change, clear, at-risk confirm and cleared cards](./t16-web-marked-view.md) | ui | Volodymyr Kozlov | M | T15 | todo |
| T17 | [Prove marks hold through every collector event and a restart, and that marking stays under 300 ms p95](./t17-marks-hold-through-collector-and-restart.md) | tests | Volodymyr Kozlov | M | T08, T10, T11 | todo |
| T18 | [Add the marked view and grace day to CONTEXT.md and update the roadmap's wave-4 row](./t18-glossary-and-roadmap.md) | docs | Volodymyr Kozlov | S | — | todo |

**Total:** 18 tasks, ~7.25 person-days (S ≈ ¼ day, M ≈ ½ day).
