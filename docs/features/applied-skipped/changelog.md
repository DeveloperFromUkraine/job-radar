# Changelog — applied-skipped

## applied-skipped — mark a posting "applied" or "skipped" so it stops coming back

**What:** Each posting on the main screen has two buttons, **Applied** and **Skipped**. The card leaves the list only after the save is confirmed, the counts drop, and a notice offers **Undo** for 8 seconds. Undo puts the card back in its place. If the mark was changed in another window since, Undo is refused and the notice points to the marked postings. Marked postings stay out of every later search, including when a collector run brings them back.

The **Show marked postings** switch (off on every visit) lists what you marked, with the mark and its date. There you can change a mark or clear it. Closed postings are shown too.
- A cleared closed posting reads "Cleared · removed after <date>": the last day it surely stays before clean-up removes it. While all of its sources are disabled, its age is frozen and it reads just "Cleared".
- An applied posting is kept by clean-up, and keeps a grace day after it loses the mark. Taking the mark off an applied posting already past the 60-day rule asks first.

An unmarked posting that looks like one you marked (the same company and title, ignoring punctuation, brackets and Sr/Jr) says "You applied to a similar posting at <company> on <date>". When every match is marked, the screen says "Nothing left to review" with the marked count and a way to show them.

**Why:** Search showed the same postings on every visit, so the owner re-read roles they had already applied to or ruled out, and lost track of which ([spec §1–§2](spec.md#1-context)). Key decisions:
- [ADR-0001](adr/0001-ship-marks-as-new-tracking-module-plus-main-screen-actions.md): marks are a new `tracking` server module plus actions on the existing main screen.
- [ADR-0002](adr/0002-snapshot-every-matching-posting-and-drop-marked-ones-as-each-page-loads.md): the search snapshot keeps every match, and each page drops marked ones as it loads, so marking never shifts the pages.
- [ADR-0003](adr/0003-keep-one-mark-row-per-posting-with-its-previous-state-deleted-with-the-posting.md): one mark row per posting, holding its previous state for a guarded Undo, deleted with the posting.
- [ADR-0004](adr/0004-find-look-alikes-on-read-with-the-collectors-merge-normalization.md): look-alikes are found on read, using the collector's merge normalization.

**How to use:** On the main screen, press **Applied** or **Skipped** on a card; turn on **Show marked postings** to review or change marks. The API is in [openapi.yaml](contracts/openapi.yaml). Every call is a same-origin JSON `POST`:
- `POST /api/v1/tracking/marks/{postingId}` with `{"mark":"applied"|"skipped"|null}` sets, changes or clears the mark and returns the `MarkState` with its `change_id`. It returns `404 TRACKING_POSTING_NOT_FOUND` when clean-up has removed the posting.
- `POST /api/v1/tracking/marks/{postingId}/undo` with `{"change_id":"…"}` reverses that change. It returns `409 TRACKING_MARK_CHANGED_ELSEWHERE` if the mark changed since.
- `POST /api/v1/search/marked-snapshots` with `{"skills":"…"}` returns the marked view; follow it with `…/{id}/pages` to load more.
- The main-list `runSearch` response now carries `marked_count` and, per posting, `look_alike`.

**Operational notes:**
- Migration: adds drizzle migration `0004_tricky_sunfire` (the `tracking_marks` table, one row per posting, foreign key with cascade delete). The server still does not migrate on start. **Run `pnpm --filter @job-radar/server db:migrate` before starting the new build.** It backs up the database to `*.bak-<timestamp>` first.
- **Backups:** restoring a database backup taken before a mark was set loses that mark, and restoring one from before this migration loses every mark. Marks can't be exported yet (spec §8, default applied at ship).
- Restart after a web rebuild: the server reads `apps/web/dist` when it starts, so restart it after `pnpm build`.
- Config: none new. The owner's time zone for the grace day and `removed_after` is the system time zone, as clean-up already uses.
- Rollback: revert the deploy and restore the `*.bak-<timestamp>` copy. For a dev database only, [`migrations/01_create_tracking_marks.down.sql`](migrations/01_create_tracking_marks.down.sql) drops `tracking_marks` by hand; collector and search data are untouched.

**Acceptance criteria delivered:** AC-01 to AC-16, plus these NFRs:
- a mark saves in ≤ 300 ms p95
- search stays within its budget with 5,000 marked postings
- marks survive a restart
- the 8-second Undo window
- the phone layout: two 44 px actions 8 px apart at 360 px, measured at ship

The change went through four review rounds (2026-10-08 and 2026-10-14). Every finding marked "fix now" is fixed and pinned by a test. Accepted residuals in spec §8, owner Volodymyr Kozlov, due 2026-10-31:
- R9: the tracking table imports the collector's postings table from collector `infra/` for its foreign key.
- R11: the owner time zone is worked out in three places.
- R12: two identical notices in a row don't restart the 8 s timer.
- R18: the focused "posting gone" notice shows no focus ring.
- R19: one wording mismatch in screens.md.
