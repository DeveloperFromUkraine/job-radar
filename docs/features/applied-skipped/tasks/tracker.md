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
| T07 | [Implement the mark, change, clear and undo use cases with their error mapping and MarkState](./t07-mark-use-cases.md) | app | Volodymyr Kozlov | M | T05, T06 | done |
| T08 | [Implement ProtectedPostings in tracking and wire it into the collector in app.ts](./t08-protected-postings-port.md) | app | Volodymyr Kozlov | S | T04, T06 | done |
| T09 | [Implement tracking's read queries for search: marked ids, the marked order, and look-alike hints](./t09-mark-queries-and-hints.md) | app | Volodymyr Kozlov | M | T03, T05, T06 | done |
| T10 | [Expose setMark and undoMark as Fastify routes behind the access guard and register the tracking plugin](./t10-tracking-routes.md) | ports | Volodymyr Kozlov | S | T07, T08 | done |
| T11 | [Make search's main list mark-aware: snapshot keeps marked, pages skip them, counts and hints](./t11-search-main-list-with-marks.md) | app | Volodymyr Kozlov | M | T08, T09 | done |
| T12 | [Add search's marked view: a fixed-order marked snapshot with skills, closed and cleared postings](./t12-search-marked-view.md) | app | Volodymyr Kozlov | M | T11 | done |
| T13 | [Add the web tracking client, the MarkActions component and PostingCard's look-alike line, marked variant and actions slot](./t13-web-client-markactions-postingcard.md) | ui | Volodymyr Kozlov | M | — | done |
| T14 | [Wire marking and the 8-second Undo notice into the main list](./t14-web-mark-and-undo.md) | ui | Volodymyr Kozlov | M | T13 | done |
| T15 | [Show the save-error, posting-gone and nothing-left-to-review states on the main screen](./t15-web-save-error-gone-nothing-left.md) | ui | Volodymyr Kozlov | S | T14 | done |
| T16 | [Build the Show marked postings switch and the marked view with change, clear, at-risk confirm and cleared cards](./t16-web-marked-view.md) | ui | Volodymyr Kozlov | M | T15 | done |
| T17 | [Prove marks hold through every collector event and a restart, and that marking stays under 300 ms p95](./t17-marks-hold-through-collector-and-restart.md) | tests | Volodymyr Kozlov | M | T08, T10, T11 | done |
| T18 | [Add the marked view and grace day to CONTEXT.md and update the roadmap's wave-4 row](./t18-glossary-and-roadmap.md) | docs | Volodymyr Kozlov | S | — | done |
| T19 | Review fix R1 (server) + R7 part: removed_after is the last day the posting stays; cleared open is back in the list | app | Volodymyr Kozlov | S | T07, T11 | done |
| T20 | Review fixes R2 + R5 + R6: each mark handles its own answer; no Undo for a null change_id; reset on a new list | ui | Volodymyr Kozlov | S | T16 | done |
| T21 | Review fixes R3 + R4 + R10: nothing-left counts marks only; Undo waits while saving; focus follows mark and Undo | ui | Volodymyr Kozlov | S | T20 | done |
| T22 | Review fixes R1 (web) + R7 + R8: Cleared with no date; missing web tests; contract-required fields required | ui | Volodymyr Kozlov | S | T21 | done |
| T23 | Re-review fix R13: main-list marks reset only on a new main snapshot; the switch never brings marked cards back | ui | Volodymyr Kozlov | S | T22 | done |
| T24 | Re-review fixes R15 + R14: notice focus only when focus was lost; gone notice focusable; screens.md dateless Cleared | ui | Volodymyr Kozlov | S | T23 | done |
| T25 | Re-review 2 fixes R16 + R17: the marked view reads its own states per marked snapshot; focus test from a focused button | ui | Volodymyr Kozlov | S | T24 | todo |

**Total:** 25 tasks (T19–T22 from review 2026-10-08, T23–T25 from re-reviews 2026-10-14), ~9 person-days (S ≈ ¼ day, M ≈ ½ day).
