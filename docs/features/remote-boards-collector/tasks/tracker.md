# Tracker — remote-boards-collector

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | [Promote the collector schema: Drizzle schema.ts + generated migration 0001](./t01-collector-schema.md) | migration | Volodymyr Kozlov | M | — | done |
| T2 | [Enforce loopback-only, same-origin access in core and map Fastify 415](./t02-core-access-guard.md) | ports | Volodymyr Kozlov | M | — | done |
| T3 | [Model the source registry, due-ness and rolling-window rate limits](./t03-domain-source-schedule.md) | domain | Volodymyr Kozlov | M | — | todo |
| T4 | [Define the settings schema, built-in defaults and per-source state](./t04-domain-settings.md) | domain | Volodymyr Kozlov | S | — | todo |
| T5 | [Define the adapter contract and normalize listings (plain text, location as stated, category filter)](./t05-domain-listing-normalize.md) | domain | Volodymyr Kozlov | M | — | todo |
| T6 | [Implement the match key and the merge decision](./t06-domain-merge.md) | domain | Volodymyr Kozlov | M | T5 | todo |
| T7 | [Implement listing closures per source verdict and the 30% hold-back](./t07-domain-closures.md) | domain | Volodymyr Kozlov | M | T5 | todo |
| T8 | [Implement the source health flags, overdue and the marker rule](./t08-domain-health-flags.md) | domain | Volodymyr Kozlov | M | T3 | todo |
| T9 | [Implement the retention clock and the once-a-day clean-up rule](./t09-domain-retention.md) | domain | Volodymyr Kozlov | S | — | todo |
| T10 | [Read, create and fall back on the settings file, persisting the last valid copy](./t10-infra-settings-file.md) | infra | Volodymyr Kozlov | M | T1, T4 | todo |
| T11 | [Build the ledgered HTTP client and the Jobicy adapter](./t11-infra-http-and-jobicy.md) | infra | Volodymyr Kozlov | L | T1, T3, T5 | todo |
| T12 | [Verify spec §8 Q1/Q3, then build the Remotive, Himalayas and We Work Remotely adapters](./t12-infra-remaining-adapters.md) | infra | Volodymyr Kozlov | L | T11 | todo |
| T13 | [Run the one-minute scheduler, start-up recovery and run opening](./t13-app-scheduler-and-run-start.md) | app | Volodymyr Kozlov | L | T1, T3, T4, T10 | todo |
| T14 | [Ingest each due source and merge its listings in one transaction](./t14-app-ingest-and-merge.md) | app | Volodymyr Kozlov | L | T6, T11, T13 | todo |
| T15 | [Finalize a run: apply closures, hold-back, flags and per-source counts](./t15-app-finalize.md) | app | Volodymyr Kozlov | L | T7, T8, T14 | todo |
| T16 | [Fill the last 30 days for a never-read source within its leftover budget](./t16-app-first-fill.md) | app | Volodymyr Kozlov | M | T14 | todo |
| T17 | [Run the daily clean-up through the MarkedPostings port](./t17-app-daily-cleanup.md) | app | Volodymyr Kozlov | M | T9, T15 | todo |
| T18 | [Serve getCollectorProblems and getSourceHealth](./t18-ports-health-routes.md) | ports | Volodymyr Kozlov | L | T2, T8, T13 | todo |
| T19 | [Serve collectNow and wire the collector plugin, scheduler and built SPA](./t19-ports-collect-now-and-wiring.md) | wiring | Volodymyr Kozlov | M | T2, T13, T18 | todo |
| T20 | [Set up query + router, the shared primitives and SCR-01 with the problem marker](./t20-ui-foundation-and-main-screen.md) | ui | Volodymyr Kozlov | L | — | todo |
| T21 | [Build SourceCard in every per-source state](./t21-ui-source-card.md) | ui | Volodymyr Kozlov | M | T20 | todo |
| T22 | [Build the SCR-02 page states and settings / interrupted-run banners](./t22-ui-source-health-page.md) | ui | Volodymyr Kozlov | M | T21 | todo |
| T23 | [Build CollectNowAction and RunProgress with 2 s polling](./t23-ui-collect-now-and-progress.md) | ui | Volodymyr Kozlov | M | T22 | todo |
| T24 | [Prove limits, interruption and start-up end to end against a fake source server](./t24-tests-collection-integration.md) | tests | Volodymyr Kozlov | M | T12, T16, T17, T19 | todo |

**Total:** 24 tasks, ~23 person-days (S = ½ day, M/L = 1 day; L marks a full day).
