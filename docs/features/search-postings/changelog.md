# Changelog — search-postings

## search-postings — the main screen lists collected postings, searchable by skills

**What:** The main screen now shows the postings the collector holds open, newest first. The owner types skills separated by commas ("React, TypeScript, machine learning"). The list then keeps only postings whose title or description mentions at least one of those skills, and each posting shows which skills matched and whether a match is in the title. Every posting names and links each source that lists it. A source that has closed its listing is shown as "closed at …" with no link, and a link that isn't an ordinary web address is never clickable. With the field empty, the main screen lists every open posting. Results come 50 at a time through **Show 50 more**, with no repeats and no gaps while collection keeps running. Postings collected later are not added to the list on screen; a notice says how many are waiting, with a **Refresh** action. Postings first collected since the previous visit are marked **new**, including ones a slower source delivered late. The last skills are remembered, and the next opening runs a fresh search for them.

**Why:** The collector filled job-radar with postings, but the owner still had no way to see them and kept checking each board by hand ([spec §1–§2](spec.md#1-context)). Every later roadmap step narrows, ranks or marks this list. Key decisions:
- [ADR-0001](adr/0001-ship-search-as-new-server-module-plus-main-screen-list.md): search is a new server module, plus the list on the existing main screen.
- [ADR-0002](adr/0002-match-skills-by-scanning-open-posting-text-in-the-app.md): skills are matched by scanning open posting text in the app, using exact text with word boundaries, so "Go" doesn't match "Google" and "C" doesn't match "C#". The upgrade path is a text cache; a combined pre-filter was benchmarked and gave no gain.
- [ADR-0003](adr/0003-page-results-from-an-in-memory-snapshot-of-ordered-ids.md): pages come from an in-memory snapshot of ordered ids, so a collection run can't shift a list that's already on screen.

**How to use:** Open the app's main screen, type skills and press **Search**. The API is in [openapi.yaml](contracts/openapi.yaml). Every call is a same-origin `POST` with a JSON body:
- `POST /api/v1/search/visits` `{}` returns the last skills and when the previous visit started.
- `POST /api/v1/search/snapshots` `{"skills":"React, Go"}` returns the first 50, `total`, `new_count` and `snapshot_id`. Invalid skills give `400 SEARCH_INVALID_SKILLS`, with a message that names the skill and the rule.
- `POST /api/v1/search/snapshots/{id}/pages` `{"cursor":"50"}` returns the next 50. `410` means the snapshot expired; reload the list.
- `POST /api/v1/search/snapshots/{id}/waiting` `{}` returns how many new postings are waiting.

**Operational notes:**
- Migration: adds drizzle migration `0003_milky_loa` (the one-row `search_state` table: last skills and visit times). The server still does not migrate on start. **Run `pnpm --filter @job-radar/server db:migrate` before starting the new build.** It backs up the database to `*.bak-<timestamp>` first.
- Restart after a web rebuild: the server reads `apps/web/dist` when it starts, so restart it after `pnpm build`. Otherwise it serves the new `index.html` without the new asset files.
- Config: none new. Snapshots live in memory, so a restart expires them, and the screen reloads the list on the resulting `410`.
- Rollback: revert the deploy and restore the `*.bak-<timestamp>` copy (project ADR-0003). For a dev database only, [`migrations/01_create_search_state.down.sql`](migrations/01_create_search_state.down.sql) drops `search_state` by hand; collector data is untouched.

**Acceptance criteria delivered:** AC-01 to AC-17, plus the NFRs: search ≤ 1 s p95 at 10,000 postings, currency, the AC-02 match examples, and the 360 px / 44 px phone layout, checked by hand at ship. Accepted residuals in spec §8, owner Volodymyr Kozlov, due 2026-10-31:
- R6: no automated browser test of the phone layout yet.
- R8: a failed collection read is not logged.
- R9: an old waiting count stays visible after later polls fail.
- R10: a posting stored in the same millisecond as the snapshot is in neither the list nor the waiting count.
