# Changelog — match-score

## match-score — a match score and a short fit note on every posting, from one profile

**What:** You set up one profile, and every posting in the main list gets a score from 0 to 100 for how well it fits, with a short "why it fits" note.

- **The profile.** It holds:
  - skills, each marked core or nice-to-have;
  - years of experience and seniority;
  - the role types you want;
  - a minimum salary;
  - engagement forms.

  You can type it on the new **Profile** screen, or upload a CV (PDF, .docx or plain text, up to 5 MB) and get a draft to correct before using it. The draft marks each field "from your CV" or "not found in your CV", and sits beside your current profile (below it on phones).
- **The score.** Each card shows the total and four parts: skills, seniority, role type and terms. A part is a number or "not stated". "Not stated" never lowers the score, and the note never guesses a salary or a level the posting doesn't give. The note names the matched core skills and, when the posting states a salary, both amounts. Claims taken from a posting ("visa sponsorship guaranteed") are shown as the posting's own words.
- **The order.** A new switch orders the list **Best match**: postings without a score first, then by score. A score never hides a posting or changes a count.
- **Changes.**
  - A posting whose text changes, or that merges with a listing from another board, keeps its old score, marked "scored against an earlier version of this posting", until it is scored again.
  - After a profile edit, every score stays shown, marked "scored against your previous profile", and is redone newest first.
- **Budget.** There is a monthly scoring cap, $5 by default and settable from $0 to $100 on the Profile screen. When the cap is reached, the main screen shows a line saying when scoring resumes. Scoring stops before an attempt could pass the cap, because each attempt first reserves its largest possible cost.
- **Problems.** "Not scored" on a card always gives the reason: no profile, pending, cap reached, provider unreachable, key missing or refused, the provider rejecting the request (for example a key not scoped to a workspace; the server log holds its message), or could not be scored after three tries. A provider or key problem raises the main-screen problem marker. An attempt the provider answered with an error costs nothing; only one with no answer at all counts. The source health screen gets a **Scoring health** block: last success, spend against the cap, pending count and oldest pending age, could-not-be-scored count, and the current problem.

**Why:** A skill match only says a word appears. The owner still had to open each posting to judge whether it is their kind of role, at their level, on terms they would take ([spec §1–§2](spec.md)). Key decisions:

- [ADR-0001](adr/0001-ship-match-score-as-a-new-matching-module-plus-a-profile-screen-and-card-additions.md): a new `matching` server module, plus a Profile screen and additions to the cards.
- [ADR-0002](adr/0002-score-with-claude-opus-5-5-at-low-effort.md): scoring uses Claude Opus 5.5 at low effort.
- [ADR-0003](adr/0003-score-one-posting-at-a-time-with-the-messages-api-in-a-background-scorer.md): a background scorer scores one posting at a time with the Messages API.
- [ADR-0006](adr/0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage.md): each attempt reserves its largest possible cost and settles from usage, so the cap holds even with failures and timeouts.
- [ADR-0007](adr/0007-extract-cv-text-locally-and-send-only-text.md): CV text is extracted locally; the name, contacts, address and links are removed before anything is sent; the CV and its text are never stored.
- [ADR-0008](adr/0008-constrain-model-output-to-part-scores-and-compute-the-total-in-job-radar.md): the model returns only part scores, a note and quoted claims. job-radar computes the total, and posting text sits in a fenced data block the text cannot close.

**How to use:**

1. Open **Profile** from the top navigation.
2. Agree to the one-time data notice. It says what is sent to Anthropic's API and to whom: the CV text once, and then the profile and each posting's text with every scoring. A name or contact detail is never sent.
3. Type the profile or upload a CV.
4. On the main screen, switch the order to **Best match**.

The API is in [openapi.yaml](contracts/openapi.yaml). Every write is a same-origin JSON `POST`:

- `GET /api/v1/matching/settings`
- `POST /api/v1/matching/notice`
- `POST /api/v1/matching/profile`
- `POST /api/v1/matching/cap` (`{"cap_usd_cents": 800}`)
- `POST /api/v1/matching/cv-drafts` (base64 file; nothing is stored)
- `GET /api/v1/matching/health`

Search results now carry a `match` per posting and a `list_order`.

**Operational notes:**

- **Migration.** It adds drizzle migration `0006_silky_polaris`:
  - three tables: `matching_settings` (a single row), `matching_scores` and `matching_spend`;
  - the nullable `search_state.list_order` column.

  The server still does not migrate on start. **Run `pnpm --filter @job-radar/server db:migrate` before starting the new build.** It backs up the database to `*.bak-<timestamp>` first.
- **Provider key.** Scoring needs `ANTHROPIC_API_KEY` in the server's environment. It is read only from there and is never stored, shown or logged.
  - Without a key, everything else works and cards say why they are not scored ("no provider key is set up").
  - **Also set a spending limit in your Anthropic account**, as the backstop if the key ever leaks. Use a key scoped to a workspace: a key that is not gets HTTP 400 on every request.
- **Config, optional.**
  - `MATCHING_MODEL` (default `claude-opus-5-5`).
  - `MATCHING_PRICE_INPUT` / `_OUTPUT` / `_CACHE_WRITE` / `_CACHE_READ` (dollars per million tokens; defaults 4 / 20 / 5 / 0.2). Keep these in step with the provider's price list; the cap is only as accurate as they are.
  - `MATCHING_SCORE_OUTPUT_LIMIT` / `MATCHING_DRAFT_OUTPUT_LIMIT`.
- **Existing data.** Nothing is backfilled. With a profile and a key, the scorer works through the list newest first within the cap, from the first start.
- **Restart after a web rebuild.** The server reads `apps/web/dist` when it starts, so restart it after `pnpm build`.
- **Real-model check.** `apps/server/scripts/eval-match-score.ts` runs the AC-01, AC-03, AC-04 and AC-05 cases against the real model; it needs the key and costs a few cents.
- **Rollback.** Revert the deploy and restore the `*.bak-<timestamp>` copy. For a dev database only, the staged [`migrations/*.down.sql`](migrations/) drop the three tables and the column by hand. Postings, marks and the remote-filter settings are untouched.

**Acceptance criteria delivered:** AC-01 to AC-21. The NFR tests cover:

- scoring freshness: 50 new postings an hour are each scored within 15 minutes while 200 stale ones are redone;
- draft time within budget after a 5 MB upload;
- the cap never passed in 1,000 attempts with charged failures and timeouts.

AC-01, AC-03, AC-04 and AC-05 also have rows in the real-model evaluation script.

The change went through five review passes on 2026-10-15 and 2026-10-16 (findings R1–R41). Every finding marked "fix now" is fixed and pinned by a test, or is a doc fix. The deferred findings are open in [spec §8](spec.md#8-open-questions) (owner Volodymyr Kozlov, due 2026-10-31):

- the CV route ignores `media_type` (R3);
- `has_profile` reads false when the profile read fails (R4);
- `MATCHING_CONCURRENCY` is unused (R12);
- the openapi `pending_count` wording (R13);
- accessibility and banner-tone items (R18, R19, R31);
- untested error states (R20);
- two scorer timer edge cases (R25, R26);
- the contact scan over very long CV text (R34);
- two invisible characters the fence misses (R38).
