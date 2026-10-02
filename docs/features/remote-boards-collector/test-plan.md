---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Volodymyr Kozlov (implementing engineer)", "Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
---

# Test plan — remote-boards-collector

The collector reads every enabled source on its own allowed schedule, merges the same role from several sources into one posting, closes a posting only on a reliable signal, keeps location statements exactly as stated, and makes every source problem visible on the main-screen marker and the source-health screen (spec §1–§2). Tasks: `tasks.json` (T1–T24); each task's DoD names the tests below.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure rules in `collector/domain/`: due-ness and rate windows, settings parsing, normalization, match key and merge decision, closures and hold-back, health flags, retention. | In-memory, injected fake clock, recorded source responses as plain data; no network, no database. |
| Integration | Collector use cases and routes against the real dependencies the module owns: the SQLite database file, the settings file, the outbound HTTP client. | A fresh, fully migrated throwaway SQLite file per test (the repo's temp-database helper); a temp directory for the settings file; a local fake source HTTP server serving recorded responses. Real job boards are never called. |
| Contract | The HTTP boundary between the server and the web app: `getCollectorProblems`, `getSourceHealth`, `collectNow`. | Server side: every route response in the integration suite is validated against `contracts/openapi.yaml`. Web side: request mocks are built from the contract's own `examples`, so both sides test against the same shapes. |
| E2E | Full collection flows through the real entry point: the app with its scheduler, the database file and the fake source server, driven by a fake clock (task T24). | One scenario per critical story: US-01 limits over time, US-06 catch-up and interrupted run, US-05 collect-now. Ephemeral database + fake source server per scenario. |
| Load | The numeric run-duration and responsiveness NFRs (spec §6). | The load tool already in your repo, or e.g. k6 or Locust, driving the API while a run works; see NFR validation. |
| Component | SCR-01 and SCR-02 pieces: ProblemMarker, SourceCard, page states, CollectNowAction, RunProgress, the shared primitives. | Render in a component harness from contract-shaped data; one test per state row in `screens.md`; assert text, links, enabled/disabled and that API text renders as text. |
| Visual-regression | <!-- N/A: two token-styled screens, no baseline tool in the repo; revisit when the postings view arrives (roadmap step 3) — owner decision 2026-10-02 --> | — |
| E2E-through-UI | <!-- N/A for v1: no browser runner in the repo; flows US-04 / US-05 are covered by component + contract + e2e at the API — owner decision 2026-10-02 --> | — |

## AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 happy | new tech listing becomes a posting with title, company, publication time, source and link | integration + e2e | The posting is stored with every field and the link back to the source |
| AC-02 invariant | source is not read again before its interval passes | unit + integration | The source is skipped in the run and its next due time is reported |
| AC-02 invariant | collect-now every minute for 7 simulated days never exceeds any limit | unit + e2e | Reads per rolling window stay at or under each source's limit, restarts included |
| AC-03 error | one failing source does not stop the others | integration + e2e | Other sources are collected; the failing one is recorded as failed with a plain reason |
| AC-03 error | failed, oversized, slow or unreadable response closes nothing | integration | No posting from that source closes; the reason names what went wrong |
| AC-04 happy | same company and title within 7 days merge into one posting | unit + integration | One posting that names and links both sources |
| AC-04 happy | same-source re-post replaces the old item | unit + integration | The new item replaces the old one at that source and is not counted as a closure |
| AC-05 invariant | different regions, teams or conflicting location statements stay apart | unit + integration | Two postings, each with its own location restriction and link |
| AC-06 cross-context | merge into a skipped posting keeps the mark and first-found time | unit + integration | Still marked skipped (marks fake), first-found time unchanged |
| AC-07 happy | posting closes when every enabled source confirmed it closed | unit + integration | Posting closed and hidden from open postings; marks kept |
| AC-08 invariant | failed, cut-short or recent-only fetch never closes a posting | unit + integration | Posting stays open |
| AC-09 invariant | one of two sources confirming closed keeps the posting open | unit + integration | Posting stays open with the still-open source's link |
| AC-10 happy | unmarked posting past 60 counted days is removed, marked one kept | unit + integration | Unmarked removed with its listings; applied/skipped kept |
| AC-10 happy | disabled-only days do not count toward the 60 days | unit | Clock paused while all of a posting's sources are disabled |
| AC-10 happy | clean-up runs once per calendar day after the first finished run | unit + integration | One clean-up per day in the owner's time zone |
| AC-11 happy | matching listing reopens a closed, not-removed posting | unit + integration | The same posting reopens with its earlier marks |
| AC-12 happy | source health shows last success, added / updated / closed, held and next due per source | integration + contract + component | Each source row carries those values; held shown separately from closed |
| AC-13 error | failing on two consecutive due runs raises a flag with a plain reason | unit + integration | Flag raised; clears after the next successful read that returns items |
| AC-13 error | zero items on two consecutive due runs raises the silent flag | unit | Flag raised; zero new but items returned does not count |
| AC-13 error | not read for more than twice its interval while the app ran raises overdue | unit + integration | Flag raised; time the laptop slept is not counted |
| AC-13 error | any marker-raising flag shows the problem marker on the main screen | contract + component | Marker shown and links to source health; disappears when the last flag clears |
| AC-14 invariant | closures above 30% of at least 10 open postings are held back | unit + integration | Postings stay open, source flagged as possibly changed; next run re-checks by itself |
| AC-15 happy | collect-now starts a run for every due source and reports progress then outcomes | integration + contract + component + e2e | Run started, progress visible every poll, then each source's outcome |
| AC-15 happy | collect-now with nothing due starts no run and lists next due times | integration + contract + component | No run; each source's next due time shown |
| AC-16 invariant | collect-now during a run starts no second run | integration + contract + component | Owner told a run is already in progress |
| AC-17 authorization | request with a foreign host is refused | integration | Refused before any collector code runs |
| AC-17 authorization | cross-site state-changing request is refused | integration | Refused; no run started |
| AC-17 authorization | state-changing request without a JSON body is refused | integration | Refused as an unsupported body |
| AC-17 authorization | server refuses to start on a non-loopback address | integration | Process exits with a plain message; nothing listens |
| AC-18 happy | sources past their interval get a catch-up run within one minute of start | integration + e2e | Catch-up run opened within one minute |
| AC-19 happy | never-read source fills newest first within its leftover budget | integration + e2e | First postings visible at once; fill stops at 30 days (Jobicy 7) or continues with a next-part time; regular reads come first |
| AC-20 error | interrupted run is recorded incomplete and closes nothing | integration + e2e | Run incomplete, no closures from it, new runs not blocked |
| AC-20 error | reads and finished fetches of an interrupted run still count | integration + e2e | Its reads count toward limits; a finished fetch is that source's last success, an unfinished one is not |
| AC-21 happy | stated location restriction is kept as stated and replaced by the latest | unit + integration | Statement kept verbatim, named after the source; a later change replaces it without re-deciding the merge |
| AC-22 invariant | missing location restriction is recorded as unknown | unit + integration | Recorded as unknown, never as anywhere |
| AC-23 happy | listing outside the owner's categories is not collected | unit + integration | Not stored; a listing in several categories is kept if one is listed |
| AC-23 happy | listing with no category is counted and skipped | unit + component | Not stored; count shown in source health |
| AC-24 error | listed category missing at the source raises a notice | unit + component | Notice in source health, no main-screen marker |
| AC-25 invariant | unusual unknown-location share flags the source | unit + integration | Listings collected as usual; source flagged with the share in the reason |
| AC-26 happy | disabled source is not read and its postings are left alone | unit + integration + component | Not read, nothing closed or removed because of it, shown as disabled |
| AC-27 error | missing settings file is created with defaults | integration + component | File created; source health says defaults are in use |
| AC-27 error | unreadable settings file keeps collection on the last valid settings | integration + component | Collection continues; source health names the problem; marker shown |
| AC-27 error | unreadable file with no last valid copy runs on defaults without overwriting | integration | Defaults used; the owner's file is left untouched |
| AC-27 error | enabled source with an unverified limit is never read | unit + component | Shown as "enabled, not read until its limits are verified"; never flagged silent |
| AC-27 error | a valid edit takes effect from the next run without a restart | integration | Next run uses the new settings |

## Screen states (component)

One component test per state row in `screens.md`, rendered from contract-shaped data:

- **SCR-01 Main screen:** default, problem, loading, error.
- **SCR-02 Source health, page:** loading, error, empty, default, run in progress, run finished, run interrupted, settings defaults in use, settings unreadable.
- **SCR-02 Collect-now action:** idle, pending, started, nothing due, already running, error.
- **SCR-02 Source card:** healthy, flagged, possibly changed, category notice, filling, disabled, not verified, never collected.
- **Every API text** (`reason`, `failure_reason`, `problem`, error `message`) renders as text even when it contains markup.

## Edge cases / error paths

- Response over 10 MB, or no answer within 30 s → expected: that source fails for this run with a plain reason; nothing closes from it.
- Malformed or unexpected response shape → expected: that source fails, the shape change is visible as a failure, nothing closes.
- Rate limit used up in the middle of a multi-page fetch → expected: the fetch is partial, pages read so far are kept, nothing closes, no failing flag.
- Process stops after a read was recorded but before it was sent → expected: the read still counts toward the limit.
- Two triggers open a run at the same moment → expected: exactly one run; the other is told a run is in progress.
- Exactly 30% of open postings would close → expected: they close (hold-back is only above 30%).
- 9 open postings, most would close → expected: they close (hold-back needs at least 10).
- Jobicy listing older than its window is missing → expected: never closed by absence; it ages out instead.
- Two existing postings both qualify for a merge → expected: the tie-break from task T6 picks one deterministically.
- Marks port fails during clean-up → expected: nothing is removed that day.
- Fill page refused → expected: that part of the fill ends without a failing flag.
- Settings file names an unknown source → expected: the whole file counts as unreadable.
- Owner's machine time zone changes day across DST → expected: still one clean-up per calendar day.

## Test data

- **Seed strategy:** builders in the repo's test helpers, per `data-model.md` §Test fixtures — `buildPosting`, `buildListing`, `buildRun`, `buildRunSource`, `seedSources`, `fakeMarkedPostings`. Companies are `Example Co`, links `https://jobs.example.test/<id>`. No real-looking personal data.
- **Recorded source responses:** per source under `apps/server/test/fixtures/sources/<source>/` (complete, capped, failed, malformed, expired items), anonymised to `example.test`.
- **Integration dependency:** a real, fully migrated throwaway SQLite file per test plus a temp directory for the settings file — never a mocked store. The only fakes are the clock, the job boards (local fake HTTP server) and the `MarkedPostings` port (another module's port, ADR-0006).
- **Cleanup boundary:** per test — each test gets its own database file and settings directory, removed in teardown; the fake source server is started and stopped per suite and reset between tests.

## NFR validation (load)

Driven by the load tool already in your repo, or e.g. k6 or Locust, against the app with a fake source server. Volume: about 300 new listings a day across sources (sad §7 "a few hundred a day"), so a 30-day fill is about 9,000 listings.

- **App start with a catch-up due — responds ≤ 5 s** → scenario: start the app with every source never read (30-day fill due); from start, request source health and problems once every 2 s for the whole fill; assert the first answer arrives within 5 s of start and every answer takes at most 5 s.
- **Regular run ≤ 5 min p95** → scenario: 20 regular runs, every enabled source due, at the daily volume above; assert p95 run duration (start to finished) ≤ 5 min.
- **First fill ≤ 30 min for hourly-allowed sources** → scenario: Jobicy never read, 7 days of listings available; assert its fill completes within 30 min of the first read.

Validated by fake-clock tests rather than load (they are time rules, not throughput): request rate per source (AC-02, e2e above), freshness ≤ 5 h / ≤ 30 h p90 (the freshness computation is checked in integration; the real figure is a 14-day KPI, spec §7), problem detection within 2 intervals (AC-13 unit), retention bound (AC-10 unit + integration).

## CI placement

- **On every PR:** unit, integration, contract and component — they need no network and run against throwaway files. The fake-clock e2e scenarios of T24 also run here while they stay under about a minute.
- **On a schedule / before release:** the load scenarios above, and the e2e scenarios if they grow past a minute.
- Real job boards are never called in CI.
