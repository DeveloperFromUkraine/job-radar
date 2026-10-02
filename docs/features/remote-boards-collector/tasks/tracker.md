# Tracker — remote-boards-collector

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | [Promote the collector schema: Drizzle schema.ts + generated migration 0001](./t01-collector-schema.md) | migration | Volodymyr Kozlov | M | — | done |
| T2 | [Enforce loopback-only, same-origin access in core and map Fastify 415](./t02-core-access-guard.md) | ports | Volodymyr Kozlov | M | — | done |
| T3 | [Model the source registry, due-ness and rolling-window rate limits](./t03-domain-source-schedule.md) | domain | Volodymyr Kozlov | M | — | done |
| T4 | [Define the settings schema, built-in defaults and per-source state](./t04-domain-settings.md) | domain | Volodymyr Kozlov | S | — | done |
| T5 | [Define the adapter contract and normalize listings (plain text, location as stated, category filter)](./t05-domain-listing-normalize.md) | domain | Volodymyr Kozlov | M | — | done |
| T6 | [Implement the match key and the merge decision](./t06-domain-merge.md) | domain | Volodymyr Kozlov | M | T5 | done |
| T7 | [Implement listing closures per source verdict and the 30% hold-back](./t07-domain-closures.md) | domain | Volodymyr Kozlov | M | T5 | done |
| T8 | [Implement the source health flags, overdue and the marker rule](./t08-domain-health-flags.md) | domain | Volodymyr Kozlov | M | T3 | done |
| T9 | [Implement the retention clock and the once-a-day clean-up rule](./t09-domain-retention.md) | domain | Volodymyr Kozlov | S | — | done |
| T10 | [Read, create and fall back on the settings file, persisting the last valid copy](./t10-infra-settings-file.md) | infra | Volodymyr Kozlov | M | T1, T4 | done |
| T11 | [Build the ledgered HTTP client and the Jobicy adapter](./t11-infra-http-and-jobicy.md) | infra | Volodymyr Kozlov | L | T1, T3, T5 | done |
| T12 | [Verify spec §8 Q1/Q3, then build the Remotive, Himalayas and We Work Remotely adapters](./t12-infra-remaining-adapters.md) | infra | Volodymyr Kozlov | L | T11 | done |
| T13 | [Run the one-minute scheduler, start-up recovery and run opening](./t13-app-scheduler-and-run-start.md) | app | Volodymyr Kozlov | L | T1, T3, T4, T10 | done |
| T14 | [Ingest each due source and merge its listings in one transaction](./t14-app-ingest-and-merge.md) | app | Volodymyr Kozlov | L | T6, T11, T13 | done |
| T15 | [Finalize a run: apply closures, hold-back, flags and per-source counts](./t15-app-finalize.md) | app | Volodymyr Kozlov | L | T7, T8, T14 | done |
| T16 | [Fill the last 30 days for a never-read source within its leftover budget](./t16-app-first-fill.md) | app | Volodymyr Kozlov | M | T14 | done |
| T17 | [Run the daily clean-up through the MarkedPostings port](./t17-app-daily-cleanup.md) | app | Volodymyr Kozlov | M | T9, T15 | done |
| T18 | [Serve getCollectorProblems and getSourceHealth](./t18-ports-health-routes.md) | ports | Volodymyr Kozlov | L | T2, T8, T13 | done |
| T19 | [Serve collectNow and wire the collector plugin, scheduler and built SPA](./t19-ports-collect-now-and-wiring.md) | wiring | Volodymyr Kozlov | M | T2, T13, T18 | done |
| T20 | [Set up query + router, the shared primitives and SCR-01 with the problem marker](./t20-ui-foundation-and-main-screen.md) | ui | Volodymyr Kozlov | L | — | done |
| T21 | [Build SourceCard in every per-source state](./t21-ui-source-card.md) | ui | Volodymyr Kozlov | M | T20 | done |
| T22 | [Build the SCR-02 page states and settings / interrupted-run banners](./t22-ui-source-health-page.md) | ui | Volodymyr Kozlov | M | T21 | done |
| T23 | [Build CollectNowAction and RunProgress with 2 s polling](./t23-ui-collect-now-and-progress.md) | ui | Volodymyr Kozlov | M | T22 | done |
| T24 | [Prove limits, interruption and start-up end to end against a fake source server](./t24-tests-collection-integration.md) | tests | Volodymyr Kozlov | M | T12, T16, T17, T19 | done |
| T25 | [Keep a failing run from staying running and a failing fill from faking a source failure](./t25-fix-run-pipeline-failures.md) | app | Volodymyr Kozlov | M | T24 | todo |
| T26 | [Mark every fetched item as seen before the category filter](./t26-fix-presence-before-category-filter.md) | app | Volodymyr Kozlov | M | T25 | todo |
| T27 | [Replace a same-source item only when the old one is gone and locations agree](./t27-fix-same-source-repost.md) | domain | Volodymyr Kozlov | M | T26 | todo |
| T28 | [Clear each flag only on the evidence its AC names and ignore flags of sources that are not read](./t28-fix-flag-clearing.md) | domain | Volodymyr Kozlov | M | T27 | todo |
| T29 | [Check owner categories against the published lists of Jobicy and Remotive](./t29-fix-published-category-lists.md) | domain | Volodymyr Kozlov | M | T28 | todo |
| T30 | [Show a rate-limited fill as stopped and resume a fill from its saved cursor](./t30-fix-fill-stopped-and-cursor.md) | migration | Volodymyr Kozlov | M | T29 | todo |
| T31 | [Move app-layer SQL into infra and keep id lists under SQLite's variable limit](./t31-fix-infra-hygiene.md) | infra | Volodymyr Kozlov | M | T30 | todo |
| T32 | [Keep the heartbeat during long runs and abort in-flight reads on shutdown](./t32-fix-heartbeat-and-shutdown.md) | app | Volodymyr Kozlov | M | T31 | todo |
| T33 | [Settings fallback in the contract, SCR-02 polling and the remaining screen fixes](./t33-fix-source-health-ui.md) | ui | Volodymyr Kozlov | M | T32 | todo |
| T34 | [Record the review decisions in spec, SAD, ADR-0004 and screens](./t34-fix-review-docs.md) | docs | Volodymyr Kozlov | M | T33 | todo |

**Total:** 34 tasks (T25–T34 are review follow-ups, 2026-10-02).
