# Tracker — remote-filter

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Create the remote_filter_settings table and promote its staged migration](./t01-remote-filter-settings-table.md) | migration | Volodymyr Kozlov | S | — | done |
| T02 | [Build the country vocabulary from Intl plus the hand-kept alias, region, zone, filler and short-code tables](./t02-country-vocabulary.md) | domain | Volodymyr Kozlov | M | — | done |
| T03 | [Read one location statement and decide one listing's verdict for a country and a date](./t03-statement-reader-and-listing-verdict.md) | domain | Volodymyr Kozlov | M | T02 | done |
| T04 | [Combine listing verdicts into one posting verdict and pin the fixed example set at a winter and a summer date](./t04-posting-verdict-and-example-set.md) | domain | Volodymyr Kozlov | M | T03 | done |
| T05 | [Keep an explicit "Anywhere" as stated in the collector, treat it as nothing stated for merge and change checks, and export it with the enabled sources](./t05-collector-keeps-anywhere.md) | domain | Volodymyr Kozlov | M | — | done |
| T06 | [Write the settings repo with the lazily created singleton row and its test fixture](./t06-settings-repo.md) | infra | Volodymyr Kozlov | S | T01 | done |
| T07 | [Implement the settings use cases: choose country, switch on/off, start or end a look, the country list, and the active filter for a visit](./t07-settings-use-cases.md) | app | Volodymyr Kozlov | M | T02, T06 | done |
| T08 | [Answer search's verdict question: verdicts for a set of postings and a country, from open listings of enabled sources, one parse per distinct statement](./t08-verdicts-for-postings.md) | app | Volodymyr Kozlov | S | T04, T05 | done |
| T09 | [Expose remote-filter's four routes behind the access guard and register the plugin in app.ts](./t09-remote-filter-routes.md) | ports | Volodymyr Kozlov | S | T07 | done |
| T10 | [Make search's main list location-aware: active filter, verdicts before the snapshot, hidden/total/new counts, check reasons and the waiting count](./t10-search-location-aware.md) | app | Volodymyr Kozlov | M | T07, T08 | done |
| T11 | [Add the web remote-filter client, the LocationFilterBar and the CountryChoice on SCR-01](./t11-web-location-bar-and-country-choice.md) | ui | Volodymyr Kozlov | M | — | done |
| T12 | [Wire the filter into the main list: re-search on change, hidden count in the summary, the check-location mark, the filter's empty message and the marked view](./t12-web-main-list-with-filter.md) | ui | Volodymyr Kozlov | M | T11 | done |
| T13 | [Prove "Anywhere" end to end from collection to verdict, and search speed with the filter on](./t13-end-to-end-and-speed.md) | tests | Volodymyr Kozlov | S | T05, T09, T10 | done |
| T14 | [Add the hidden count and one-off look to CONTEXT.md, amend the collector spec's "Anywhere" reading, and point applied-skipped's contract at this one](./t14-glossary-collector-spec-and-contract-pointers.md) | docs | Volodymyr Kozlov | S | — | done |
| T15 | [Review fix F-1: non-Latin words and emoji count as unknown](../_review/review-2026-10-15.md) | domain | Volodymyr Kozlov | S | — | done |
| T16 | [Review fix F-2: bare zone name equal to the judged country is unknown](../_review/review-2026-10-15.md) | domain | Volodymyr Kozlov | S | T15 | done |
| T17 | [Review fix F-3: empty-message switch shows pending and error](../_review/review-2026-10-15.md) | ui | Volodymyr Kozlov | S | — | done |
| T18 | [Re-review fix N-1: other symbols count as unknown words](../_review/review-2026-10-15.md) | domain | Volodymyr Kozlov | S | T15 | done |
| T19 | [Re-review fix N-2: a filter change clears the old switch error](../_review/review-2026-10-15.md) | ui | Volodymyr Kozlov | S | T17 | done |
| T20 | [Re-review 2 fix N-1b: a fixed separator set](../_review/review-2026-10-15.md) | domain | Volodymyr Kozlov | S | T18 | done |
| T21 | [Re-review 2 fix N-2b: switches clear old errors on a new list](../_review/review-2026-10-15.md) | ui | Volodymyr Kozlov | S | T19 | done |
| T22 | [Re-review 3 fix N-1c: a dash run between two zones is unknown](../_review/review-2026-10-15.md) | domain | Volodymyr Kozlov | S | T20 | done |
| T23 | [Re-review 3 fix N-3: straighten curly quotes and guillemets](../_review/review-2026-10-15.md) | domain | Volodymyr Kozlov | S | T20 | done |
| T24 | [Re-review 4 fix N-4: broken-range check before place names](../_review/review-2026-10-15.md) | domain | Volodymyr Kozlov | S | T22 | done |

**Total:** 24 tasks, ~8 person-days (S ≈ ¼ day, M ≈ ½ day).
