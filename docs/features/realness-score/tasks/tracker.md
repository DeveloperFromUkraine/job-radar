# Tracker — realness-score

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Promote the staged schema: pay_field, reopened_at and the three realness tables](./t01-realness-schema.md) | migration | Volodymyr Kozlov | S | — | done |
| T02 | [Write the amount parser and its labelled salary set](./t02-amount-parser.md) | domain | Volodymyr Kozlov | M | — | done |
| T03 | [Write the signal and penalty rules: age basis, many boards, repost, no salary, cap 30](./t03-signal-and-penalty-rules.md) | domain | Volodymyr Kozlov | M | — | done |
| T04 | [Let search's bestMatchOrder take a realness penalty](./t04-best-match-order-with-penalty.md) | domain | Volodymyr Kozlov | S | — | done |
| T05 | [Keep each board's pay field on every fetch and the reopening time in the collector](./t05-collector-keeps-pay-field-and-reopening.md) | infra | Volodymyr Kozlov | M | T01, T02 | done |
| T06 | [Export the realness facts from collector/app: reopening, pay fields, closed heads, pay-field boards](./t06-collector-realness-exports.md) | app | Volodymyr Kozlov | S | T01 | done |
| T07 | [Add the realness module with its switch: settings repo, GET/POST /api/v1/realness/settings, registration](./t07-realness-module-and-switch.md) | ports | Volodymyr Kozlov | M | T01 | done |
| T08 | [Implement assess(): work out penalty and signals for a set of postings with switch-on rules](./t08-realness-assess.md) | app | Volodymyr Kozlov | M | T02, T03, T06, T07 | done |
| T09 | [Keep realness with every mark and once a day: mark records, daily share, tracking's onMarkChanged hook](./t09-mark-records-and-daily-share.md) | app | Volodymyr Kozlov | M | T08 | done |
| T10 | [Assess at snapshot build, order by penalty, and present realness and realness_on in search](./t10-search-orders-and-presents-realness.md) | app | Volodymyr Kozlov | L | T04, T08, T09 | done |
| T11 | [Show the reason line on posting cards (ReasonLine + api types)](./t11-web-reason-line.md) | ui | Volodymyr Kozlov | S | — | done |
| T12 | [Add the realness switch to the main screen and offer best match first without a profile](./t12-web-realness-switch.md) | ui | Volodymyr Kozlov | M | T11 | done |
| T13 | [Prove no loss, unchanged speed, zero cost and refused outsiders end to end](./t13-no-loss-nfr-and-access-tests.md) | tests | Volodymyr Kozlov | M | T10 | done |
| T14 | [Write the amended match-score AC-11 and collector AC-11 into their specs](./t14-upstream-amendments.md) | docs | Volodymyr Kozlov | S | T05, T10 | done |
| R01 | [Fix the salary rule: next-words limit, bare million amounts, currency-less board pay fields (review F-01, F-02)](../_review/review-2026-10-16.md) | domain | Volodymyr Kozlov | S | — | done |
| R02 | [Server failure paths: no 0-of-0 share, last-known switch, 503 on a failed switch read (review F-03, F-04, F-05)](../_review/review-2026-10-16.md) | app | Volodymyr Kozlov | S | — | todo |
| R03 | [Switch keeps the saved state while the list reloads (review F-06)](../_review/review-2026-10-16.md) | ui | Volodymyr Kozlov | S | — | todo |
| R04 | [Close the test-plan gaps: AC-07/08/09/10/14 rows, SCR-01 loading + marked, AC-13 provider check, latency 50 + closed look-alikes (review F-07..F-10)](../_review/review-2026-10-16.md) | tests | Volodymyr Kozlov | S | R02, R03 | todo |
| R05 | [Tidy: unused realness exports, error detail in write logs, one day formatter (review F-11..F-13)](../_review/review-2026-10-16.md) | app | Volodymyr Kozlov | S | R02 | todo |

**Total:** 14 tasks, ~11.5 person-days + 5 review follow-ups.
