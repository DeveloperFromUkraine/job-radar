# Changelog — realness-score

## realness-score — stale or suspicious postings sit lower in best match first, and each card says why

**What:** Postings that look stale or not really hiring now sit lower in the **Best match** order, and every such card names its reasons. Nothing is hidden, and the score on the card does not change.

- **Signals.** There are four, all worked out from data the collector already keeps:
  - **Age.** 30–59 days old is 10 points; 60 days or more is 20.
  - **Long life on many boards.** Open at three or more enabled boards and first found 45 or more days ago is 15 points. Only the larger of age and long life counts.
  - **Repost.** The collector reopened the posting, or an earlier, closed look-alike posting is more than 7 days older. This is 10 points.
  - **No salary.** Neither the board's own pay field nor the title or description gives an amount of pay. This is 5 points. Wording such as "competitive" or "DOE" counts as no salary, and amounts that are not pay ("$5M Series A", "$2,000 learning budget") are never read as salary.

  The penalty is capped at 30 points.
- **The order.** Best match first orders scored postings by score minus penalty. Within the unscored block at the top, postings with no penalty come first, then the rest from the smallest penalty up. Best match first now works without a profile, so realness ranks the list even with no profile, no key, or the scoring cap reached. **Newest first is unchanged.**
- **The reason line.** A lowered card in best match first reads, for example, "Lowered: first found 47 days ago · reposted · no salary listed". In newest first, the same signals show as "Signals: …". The line says "posted N days ago" only when the board gave the publication time, and "first found N days ago" otherwise. The line is built from fixed phrases, never from posting text.
- **The switch.** A **Lower stale postings** switch on the main screen turns the penalty and the lines off and on again. It is on by default, and the choice is kept. If the choice cannot be saved, the switch goes back to its previous state and says so.
- **Records for the §7 checks.** Each applied or skipped mark keeps the posting's penalty and signals as they were when it was marked, worked out as if the switch were on. Once a day, the first opening of the list keeps the share of lowered postings in it.

**Why:** A high match score says a role fits. It does not say the role is still being filled. The owner was spending applications first on old, reposted or pay-less postings that fit well, and hearing nothing back ([spec §1–§2](spec.md)). Key decisions:

- [ADR-0001](adr/0001-ship-realness-as-a-new-realness-module-read-by-search-and-told-of-marks-by-tracking.md): a new `realness` server module. Search reads it, and tracking tells it about marks.
- [ADR-0002](adr/0002-work-out-realness-signals-when-search-builds-a-snapshot.md): signals are worked out when search builds a snapshot. Nothing is precomputed, and the result costs nothing and calls no provider.
- [ADR-0003](adr/0003-offer-best-match-first-without-a-profile-and-treat-unreadable-scores-as-unscored.md): best match first is offered without a profile, and an unreadable score counts as unscored.
- [ADR-0004](adr/0004-keep-each-boards-pay-field-as-text-on-the-listing-and-judge-it-in-realness.md): each board's pay field is kept as text on the listing, and realness judges it.

**How to use:** On the main screen, switch the order to **Best match**. Lowered cards show their "Lowered: …" line. Use the **Lower stale postings** switch to compare with the plain score order.

The API is in [openapi.yaml](contracts/openapi.yaml). Every write is a same-origin JSON `POST`:

- `GET /api/v1/realness/settings` returns `{"realness_on": true}`.
- `POST /api/v1/realness/settings` takes `{"on": false}`.

Search results now carry `realness_on`, and every posting carries `realness` (its penalty and signals, or `null`).

**Operational notes:**

- **Migration.** It adds drizzle migration `0007_icy_khan`:
  - three tables: `realness_settings` (a single row), `realness_mark_records` and `realness_daily_shares`;
  - the nullable columns `collector_listings.pay_field` and `collector_postings.reopened_at`.

  The server still does not migrate on start. **Run `pnpm --filter @job-radar/server db:migrate` before starting the new build.** It backs up the database to `*.bak-<timestamp>` first.
- **Existing data.** Nothing is backfilled.
  - A listing collected before this ships has an unknown pay state until its next fetch. On a board with a pay field, an unknown state never counts as "no salary".
  - Reopenings are counted only from this release on.
- **Config.** None. Realness needs no key and adds nothing to the scoring cap's spend.
- **Restart after a web rebuild.** The server reads `apps/web/dist` when it starts, so restart it after `pnpm build`.
- **Rollback.** Revert the deploy and restore the `*.bak-<timestamp>` copy. For a dev database only, the staged [`migrations/*.down.sql`](migrations/) drop the three tables and the two columns by hand. Postings, marks, scores and the remote-filter settings are untouched.

**Acceptance criteria delivered:** AC-01 to AC-14. The NFR tests cover:

- the search p95 within 1 s with 10,000 postings, realness on, in both orders;
- property tests showing the same postings and counts, and the same newest-first order, with realness on and off;
- the salary rule right on 153 of 153 hand-labelled real postings, at least 95% required;
- zero provider requests from realness.

The change went through six review passes on 2026-10-16 (follow-up tasks R01–R11). Review 6 passed. The known salary-rule residuals are open in [spec §8](spec.md#8-open-questions) (owner Volodymyr Kozlov):

- **Fix first after merge.** A bare salary followed by "plus" ("Salary: 45,000 plus benefits") reads as no salary. The tested one-line fix is in §8.
- **Due 2026-11-30, at the §7 hand check.** The other shapes listed there: "pays $52,000", pipe-separated headers, stipends, Indian digit grouping, and bare salaries followed by a plural or currency word.
