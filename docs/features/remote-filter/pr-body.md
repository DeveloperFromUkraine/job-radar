## Summary

The main list now hides postings that are not open to the owner's country, counts what it hid, and never hides a posting whose location it can't read with confidence: those stay in the list, marked "check location" with the reason. The owner can look at another country for one visit or switch the filter off. The collector now keeps an explicit "Anywhere" as stated. Spec: [`docs/features/remote-filter/spec.md`](docs/features/remote-filter/spec.md). Changelog: [`changelog.md`](docs/features/remote-filter/changelog.md).

**Stacked on #3** (`feature/applied-skipped`). Merge #3 first, or retarget this PR to `master` once it lands.

## Acceptance criteria

- AC-01 — postings that name the country, a region containing it, Worldwide, or covering time zones are shown; the rest are hidden ✓
- AC-02 — an unstated, unrecognised, exception or hours-only statement is never hidden; it is marked "check location" with the reason ✓
- AC-03 — a merged posting takes its best listing verdict; "Anywhere" is set aside beside a specific statement ✓
- AC-04 — before choosing, every posting shows with a prompt; the chosen country and the on state survive a restart ✓
- AC-05 — an unknown name ("Polnd", "Europe") chooses nothing and changes nothing ✓
- AC-06 — a one-visit look at another country leaves the saved country alone ✓ (UI reaches it only with the filter on; see F-4)
- AC-07 — "N postings — M hidden, not open to X", and a sticky off switch ✓
- AC-08 — when the filter hides every match, the empty message says how many and offers to switch it off ✓
- AC-09 — the waiting and new counts agree with the filtered list ✓
- AC-10 — an explicit "Anywhere" is kept as stated, reads as Worldwide, and still counts as nothing for merging ✓
- AC-11 — a hidden look-alike stays hidden; the marked view ignores the filter ✓
- AC-12 — another host or a cross-site page can't read or change the settings ✓
- AC-13 — changing the country refilters at once and switches the filter on ✓ (the off→change path is server-only; see F-4)

Known deviation F-4 and accepted residual N-5 are recorded in the [review](docs/features/remote-filter/_review/review-2026-10-15.md) and under AC-06 / AC-13 in the spec.

## Design

- Spec: `docs/features/remote-filter/spec.md`
- Architecture: `docs/features/remote-filter/sad.md`
- Decisions: `docs/features/remote-filter/adr/` (ADR-0001…0003)
- Data model + migration: `docs/features/remote-filter/data-model.md` (drizzle migration `0005_stormy_bucky`)
- API: `docs/features/remote-filter/contracts/openapi.yaml`
- Screens: `docs/features/remote-filter/screens.md`

## Tasks

These commits carry no `SDD-Task` trailers. The mapping comes from `tasks.json` and the review record:

| Task | Commit | |
|---|---|---|
| T01 | 140dd45 | `remote_filter_settings` table and migration |
| T02 | 8976b25 | country vocabulary from `Intl` plus hand-kept tables |
| T03 | 49fa997 | statement reader and listing verdict |
| T04 | c01b866 | posting verdict and pinned example set |
| T05 | cf1b068 | collector keeps an explicit "Anywhere" |
| T06 | 9d46a9c | settings repo |
| T07 | 0092b19 | settings use cases |
| T08 | 6219fc6 | verdicts for a set of postings |
| T09 | fbc1cfc | four routes behind the access guard |
| T10 | 986c241 | location-aware main list |
| T13 | 0f73d9a | "Anywhere" end to end and speed with the filter on |
| T14 | 3b5b19c | glossary, collector spec amendments, contract pointers |
| T11 | 20dec1a | web client, LocationFilterBar, CountryChoice |
| T12 | 8f17e11 | filter wired into the main list |
| T15–T24 | 657f7f2 … 1551e9e | review fixes F-1–F-3, N-1–N-4 (ten commits) |

## Verification

- Unit + integration: `pnpm vitest run` gives 1196/1196 in 84 files (Node 22, 2026-10-15). Neither known flaky test failed.
- Lint + types: `biome check` is clean, and `tsc --noEmit` is clean for server and web.
- Ran the feature on a migrated copy of the owner's live database (161 open postings, collector running), with skills "TypeScript":
  - **AC-04:** before choosing, 49 shown, 0 hidden, mode `none`. After choosing Poland, 19 shown and 30 hidden (USA, Canada, LATAM, Brazil, Argentina, Spain, Czechia, UK, APAC, "Remote - Americas"). Shown: Europe, EMEA, Poland, Worldwide, "Anywhere in the World" and mixed lists that include Europe. After a server restart, Poland and filter-on persisted.
  - **AC-02:** a posting with no stated location stayed in the list as `check / not_stated`.
  - **AC-05:** "Polnd" and "Europe" returned `400 REMOTE_FILTER_UNKNOWN_COUNTRY`, and the settings were unchanged.
  - **AC-06:** a look at Germany gave mode `look`, 17 shown and 32 hidden, with the saved country still PL. Ending the look returned mode `own`.
  - **AC-07:** the UI counter read "19 postings — 30 hidden, not open to Poland". Switching off gave 49 shown with no check marks, and the bar read "Location filter is off".
  - **AC-08:** "Solidity" showed "No posting open to Poland matches. The location filter hid 2." with **Switch filter off**. Pressing it showed both postings.
  - **AC-10:** We Work Remotely postings collected during the run show "Anywhere in the World" and fit.
  - **AC-12:** `sec-fetch-site: cross-site` got `403 CROSS_SITE_REQUEST`, and a foreign Host got `403 FORBIDDEN_HOST`. The settings were unchanged.
  - **AC-13:** choosing "🇵🇹" while the filter was off saved PT, switched the filter on and refiltered.
  - **Phone NFR:** at 360 px there is no horizontal scroll, and Change, Other country, Switch off, Switch filter off and Clear skills are each 44 px tall.
- Not run by hand: AC-03, AC-09 and AC-11. They need staged merges, a timed collector run and marks, and are covered by integration tests.

## Operational notes

- Migration: `0005_stormy_bucky`. The server does not migrate on start, so run `pnpm --filter @job-radar/server db:migrate` before starting the new build (it backs up the database first). Rollback: revert the deploy and restore the `*.bak-<timestamp>` copy.
- Restart the server after `pnpm build` in `apps/web`.
- Feature flag / config: none.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019PDFQtem7YfBksryS99hh6
