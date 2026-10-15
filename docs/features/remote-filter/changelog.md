# Changelog — remote-filter

## remote-filter — hide postings that are not open to your country

**What:** The main screen now filters the list by where a posting says its candidates may live. You choose your country once (by name, short name or flag). From then on, the list hides postings whose stated location leaves your country out, and the counter says how many were hidden: "19 postings — 30 hidden, not open to Poland".
- A posting **fits** when its statement names your country, a region that contains it ("EMEA", "Europe"), says Worldwide or "Anywhere", or gives only time zones that cover your country's offset in winter or summer.
- A posting the filter can't read with confidence is **never hidden**. It stays in the list marked "check location", with the reason: location not stated / not recognised / mentions an exception / only working hours fit. Unknown words, other scripts, emoji, soft wording ("preferred") and odd range punctuation all land here, never in "hidden".
- A posting merged from several boards is hidden only when every open listing states a readable location that leaves your country out.
- **Other country** lets you look at, say, Germany for the rest of the visit. Your saved country stays the same, and **Back to Poland** ends the look.
- **Switch off** shows everything without the distinction, and stays off until you switch it on again. When the filter hides every match, the empty message says how many it hid and offers **Switch filter off**.
- The collector now keeps an explicit "Anywhere" / "Anywhere in the World" (Jobicy, We Work Remotely) as stated, instead of recording it as unknown. For merging, it still counts as stating nothing.

**Why:** Most remote postings are open only to some countries, so the owner spent each visit opening postings they could not apply to ([spec §1–§2](spec.md)). Key decisions:
- [ADR-0001](adr/0001-ship-the-filter-as-a-new-remote-filter-module-plus-main-screen-controls.md): a new `remote-filter` server module plus controls on the existing main screen.
- [ADR-0002](adr/0002-decide-location-verdicts-on-read-when-search-builds-its-snapshot.md): verdicts are decided on read, when search builds its snapshot, and are never stored. A better reader re-judges everything at once, with no backfill.
- [ADR-0003](adr/0003-build-the-country-vocabulary-from-intl-plus-small-hand-kept-tables.md): the country list comes from `Intl`, plus small hand-kept tables for regions, aliases, zone names and short codes. The chooser and the filter share the same list.

**How to use:** On the main screen, choose your country in the location bar; use **Change**, **Other country** or **Switch off** after that. The API is in [openapi.yaml](contracts/openapi.yaml). Every write is a same-origin JSON `POST`:
- `GET /api/v1/remote-filter/settings` returns the country (or `null`), `filter_on` and the country list.
- `POST /api/v1/remote-filter/country` with `{"name":"Poland"}` (or `"🇵🇱"`) saves the country and switches the filter on. An unknown name ("Polnd", "Europe") returns `400 REMOTE_FILTER_UNKNOWN_COUNTRY` and changes nothing.
- `POST /api/v1/remote-filter/filter` with `{"on":false}` switches the filter off or on.
- `POST /api/v1/remote-filter/look` with `{"name":"Germany"}` starts a look for this visit; `{"name":null}` ends it.
- The search result now carries `hidden_count` and `location_filter` (`mode`: `none` / `own` / `look` / `off`), and each posting carries `location_check`.

**Operational notes:**
- Migration: adds drizzle migration `0005_stormy_bucky` (the `remote_filter_settings` table, a single row created lazily with the filter on and no country). The server still does not migrate on start. **Run `pnpm --filter @job-radar/server db:migrate` before starting the new build.** It backs up the database to `*.bak-<timestamp>` first.
- Existing data: nothing is backfilled. Verdicts are computed on read, so every posting already collected is filtered as soon as the country is chosen. A listing the collector stored as unknown "Anywhere" takes the new reading the next time its source offers it. That change is not counted as an update or in source health.
- Restart after a web rebuild: the server reads `apps/web/dist` when it starts, so restart it after `pnpm build`.
- Config: none new.
- Rollback: revert the deploy and restore the `*.bak-<timestamp>` copy. For a dev database only, [`migrations/01_create_remote_filter_settings.down.sql`](migrations/01_create_remote_filter_settings.down.sql) drops the table by hand; postings and marks are untouched.

**Acceptance criteria delivered:** AC-01 to AC-13, plus these NFRs:
- search p95 ≤ 1 s with the filter on (10,000 postings, 20 skills)
- 100% of the fixed example set gives the expected verdict, on a winter date and a summer date
- 0 wrong hides on generated unfamiliar, exception and empty statements (property test)
- the phone layout: every filter action is 44 px tall at 360 px, with no horizontal scroll, measured at ship

The change went through six review rounds on 2026-10-15. Every finding marked "fix now" (F-1 to F-3, N-1 to N-4) is fixed and pinned by a test. Known deviation and residual:
- F-4: the UI offers **Other country** and **Change** only while the filter is on. The server serves and tests both paths with the filter off (noted under AC-06 and AC-13).
- N-5: a flag-only "🇵🇱 (CET) - 🇷🇴 (EET)" list reads as check instead of fits. It is never a wrong hide.

Open questions in spec §8 (owner Volodymyr Kozlov, due 2026-10-31): whether source health should flag a jump in the hidden share, and whether "check" postings should later be resolved from descriptions.
