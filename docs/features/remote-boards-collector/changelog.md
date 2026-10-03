# Changelog — remote-boards-collector

## remote-boards-collector — job-radar now collects remote tech postings by itself

**What:** While the app runs, job-radar reads Jobicy and We Work Remotely every hour, and Himalayas and Remotive every 6 hours. It keeps only listings in the owner's tech categories. When several boards, or one board re-posting, advertise the same role, it becomes one posting that links every source. A posting closes only when every enabled source confirms it is gone. Old unmarked postings are cleared after 60 days. A new **Source health** screen shows each source's last success, its counts (added, updated, closed, held), when it is next due, the first 30-day fill and any problem flag. The main screen shows a marker when a problem could cost the owner postings, and a **Collect now** button starts a run on demand. We Work Remotely is read from its public RSS feed, which anyone may use with a link back ([fix record](_fixes/2026-10-03-enable-we-work-remotely.md)).

**Why:** The owner found jobs by opening boards by hand, which was slow and easy to forget, and they want to be among the first to apply ([spec §1–§2](spec.md#1-context)). Every later roadmap step (search, scoring, the remote filter, marks, alerts) reads what this collects. Key decisions:
- [ADR-0003](adr/0003-drive-collection-from-a-one-minute-due-check-over-persisted-state.md): collection is driven by a one-minute due check over persisted state, so catch-up after sleep and source rate limits fall out of the same rule.
- [ADR-0004](adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md): one adapter contract with a per-source close signal.
- [ADR-0005](adr/0005-store-postings-and-listings-separately-and-merge-at-collection-time.md): postings and listings are stored separately and merged at collection time.
- [ADR-0006](adr/0006-keep-owner-marks-behind-a-port-the-collector-consults-before-removal.md): owner marks sit behind a port the collector checks before it removes anything.
- [ADR-0007](adr/0007-allow-only-loopback-same-origin-requests-without-accounts.md): the app accepts only loopback, same-origin requests, with no accounts.

**How to use:** Start the app and open **Source health**. The first start creates `settings.json` next to the database with the defaults; edit it to enable sources or change categories, and the next run picks up the change. The API is in [openapi.yaml](contracts/openapi.yaml):
- `GET /api/v1/collector/source-health`
- `GET /api/v1/collector/problems`
- `POST /api/v1/collector/runs` with body `{}` (collect now). It answers `202` when a run starts, `200 {started:false, next_due}` when no source may be read yet, and `409` when a run is already in progress.

**Operational notes:**
- Migration: adds drizzle migrations `0001_groovy_skaar` (sources, ledger, flags, runs, postings, listings, state) and `0002_stale_prodigy` (the fill cursor). **The server does not migrate on start. Run `pnpm --filter @job-radar/server db:migrate` before the first start**, or startup fails with `no such table: collector_sources`. `db:migrate` copies the database to `*.bak-<timestamp>` before migrating.
- Config: `settings.json` sits in the same folder as `DATABASE_FILE` (default `data/`). It is created with the defaults if missing, and an invalid file keeps the last valid settings. `HOST` must stay loopback; the server binds to `127.0.0.1:3000` by default.
- Node: requires Node 22, because better-sqlite3 is built for that ABI. Under Node 20 the process segfaults silently.
- Rollback: revert the deploy and restore the `*.bak-<timestamp>` copy made by `db:migrate`. The staged `migrations/*.down.sql` files undo the schema by hand in reverse order (05→01).

**Acceptance criteria delivered:** AC-01 to AC-27. AC-06, AC-07, AC-10 and AC-11 are verified against test data that carries marks, and will be re-verified with real marks when roadmap step 6 ships. Accepted residuals with an owner, due 2026-10-31: spec §8 L4 (overdue wording during a first fill), L5 (one contract example) and L6/Q1 (an expired Himalayas item can leave a dead second listing on a posting).
