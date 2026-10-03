## Summary

job-radar now collects remote tech postings from Jobicy and We Work Remotely (every hour), Himalayas and Remotive (every 6 hours) while the app runs. The same role from several boards becomes one posting. Postings close only on a reliable signal, and each source's health is visible in a new Source health screen, with a problem marker on the main screen. We Work Remotely is read from its public RSS feed (spec §8 Q1, answered 2026-10-03). Spec: [`docs/features/remote-boards-collector/spec.md`](docs/features/remote-boards-collector/spec.md). Changelog: [`changelog.md`](docs/features/remote-boards-collector/changelog.md).

## Acceptance criteria

- AC-01 — a due source's new tech listing becomes a posting with title, company, publication time, source and link ✓
- AC-02 — a source is never read before its interval passes (schedule, catch-up and collect-now alike) ✓
- AC-03 — a failing source doesn't stop the others, closes nothing and shows a plain-language reason ✓
- AC-04 / AC-05 — the same role across sources or a re-post merges into one posting; different titles or conflicting locations stay separate ✓
- AC-06 — a merge keeps the owner's mark and first-found time ✓
- AC-07 / AC-08 / AC-09 — a posting closes only when every enabled source confirms; a failed or partial fetch never closes anything ✓
- AC-10 — unmarked postings are removed 60 days after closing or after the last offer; marked ones are kept ✓
- AC-11 — a closed posting reopens with its marks instead of being duplicated ✓
- AC-12 / AC-13 — source health shows the last success, counts and next due; failing, silent and overdue sources are flagged and the main-screen marker shows ✓
- AC-14 — a single run may not close more than 30% of a source's open postings; the excess is held back and flagged ✓
- AC-15 / AC-16 — collect-now starts a run for the due sources; a second run is refused while one is in progress ✓
- AC-17 — the app is reachable only on the owner's machine ✓
- AC-18 / AC-19 / AC-20 — catch-up within 1 min of start; a newest-first 30-day first fill; an interrupted run is recorded as incomplete ✓
- AC-21 / AC-22 — location statements are kept verbatim; a missing one is recorded as unknown, never "anywhere" ✓
- AC-23 / AC-24 / AC-25 — the category filter, a category that matched nothing, and an unusual unknown-location share are each flagged ✓
- AC-26 / AC-27 — a disabled source is left alone; a missing settings file gets defaults and an invalid one falls back to the last valid settings ✓

Accepted residuals, due 2026-10-31: spec §8 L4, L5 and L6/Q1.

## Design

- Spec: `docs/features/remote-boards-collector/spec.md`
- Architecture: `docs/features/remote-boards-collector/sad.md`
- Decisions: `docs/features/remote-boards-collector/adr/` (ADR-0001…0007)
- Data model + migrations: `docs/features/remote-boards-collector/data-model.md` (drizzle `0001_groovy_skaar`, `0002_stale_prodigy`)
- API: `docs/features/remote-boards-collector/contracts/openapi.yaml`
- Screens / flows: `screens.md`, `ux-flows.md`
- Reviews: `_review/` (6 rounds; round 6 PASS)

## Tasks (SDD-Task trailers)

- `558d554` T1 — feat(remote-boards-collector): promote the collector schema
- `8f76a9c` T2 — feat(remote-boards-collector): loopback-only, same-origin access guard
- `496eca3` T3 — feat(remote-boards-collector): source registry, due-ness and rate windows
- `93e0056` T4 — feat(remote-boards-collector): settings schema, defaults and source state
- `1143afd` T5 — feat(remote-boards-collector): adapter contract and listing normalization
- `95349ab` T9 — feat(remote-boards-collector): retention clock and daily clean-up rule
- `c0a1365` T6 — feat(remote-boards-collector): match key and merge decision
- `73b6d7e` T7 — feat(remote-boards-collector): closure decisions and 30% hold-back
- `98fd58b` T8 — feat(remote-boards-collector): source health flags and the marker rule
- `afeaa08` T10 — feat(remote-boards-collector): settings file reader with last-valid fallback
- `4a8f994` T11 — feat(remote-boards-collector): ledgered source HTTP and the Jobicy adapter
- `3b4248a` T12 — feat(remote-boards-collector): Remotive, Himalayas and WWR adapters
- `9a34cd7` T13 — feat(remote-boards-collector): scheduler, start-up recovery and run opening
- `6856f40` T14 — feat(remote-boards-collector): ingest a due source and merge its listings
- `e880984` T15 — feat(remote-boards-collector): finalize a run — closures, flags, counts
- `a96d341` T16 — feat(remote-boards-collector): first fill within the leftover read budget
- `27f2641` T17 — feat(remote-boards-collector): daily clean-up through the MarkedPostings port
- `bbbb901` T18 — feat(remote-boards-collector): serve getCollectorProblems and getSourceHealth
- `0caed59` T19 — feat(remote-boards-collector): collect-now and the collector module wiring
- `e99331f` T20 — feat(remote-boards-collector): web data layer, shared primitives and SCR-01
- `522a59e` T21 — feat(remote-boards-collector): SourceCard in every per-source state
- `a0ecf89` T22 — feat(remote-boards-collector): SCR-02 page states and banners
- `b913510` T23 — feat(remote-boards-collector): collect-now action and run progress
- `9624187` T24 — test(remote-boards-collector): end to end against a fake source server
- `fd0ac0c` T25 — fix(remote-boards-collector): a failing run or fill can no longer stall collection
- `776a6c2` T26 — fix(remote-boards-collector): items dropped by the category filter are still seen
- `e4e74fb` T27 — fix(remote-boards-collector): a live item is never treated as a re-post
- `43f4e1d` T28 — fix(remote-boards-collector): flags clear only on the evidence their AC names
- `9967fc6` T29 — fix(remote-boards-collector): check categories against published lists
- `56e9be5` T30 — fix(remote-boards-collector): honest fill status and a resumable fill cursor
- `bdcaf03` T31 — refactor(remote-boards-collector): SQL only in infra; id lists in chunks
- `0d85670` T32 — fix(remote-boards-collector): heartbeat during long runs; prompt shutdown
- `1e3caef` T33 — fix(remote-boards-collector): honest settings banner and SCR-02 refresh
- `6766fca` T34 — docs(remote-boards-collector): record the review decisions
- `ff9fd35` T35 — fix(remote-boards-collector): close the round-2 review findings
- `e3816bb` T36 — docs(remote-boards-collector): the limited fill state in the flows
- `60ae928`, `b78b85f`, `d9c695c`: fixes from review rounds 3–5 (re-post rules, expiry as proof of gone)
- `9df8fbf`: test timeout headroom for the 7-day rate-limit simulation
- `29a331f`: enable We Work Remotely — RSS adapter, hourly rate, `expires_at` close signal (`_fixes/2026-10-03-enable-we-work-remotely.md`)

## Verification

- Unit + integration (Vitest, SQLite temp DBs, no Docker): **333/333 pass**. The 7-day rate-limit simulation takes ~100 s and timed out at 120 s under full-suite load, so its timeout was raised to 300 s (`9df8fbf`).
- Lint (biome) and `tsc --noEmit` on server and web: clean.
- Ran the feature against the live boards, on a fresh scratch database:
  - Start-up: the API answered in 2.0 s (NFR ≤ 5 s).
  - AC-27: `settings.json` was created with the defaults, We Work Remotely disabled.
  - AC-18 / AC-19: a catch-up run started on boot and added 75 Jobicy, 2 Himalayas and 9 Remotive postings. The Jobicy fill completed; the Himalayas fill shows `limited`.
  - AC-01: stored postings have title, company, publication time, source and link.
  - AC-21 / AC-22: location statements are stored verbatim, double spaces included. One Jobicy listing with no stated location is stored as unknown; no "Anywhere" value was stored.
  - AC-02 / AC-15: collect-now right after the run returned `200 {started:false}` with each source's next due time (Jobicy +1 h, Himalayas and Remotive +6 h, WWR disabled).
  - AC-17 / ADR-0007: the server listens only on `127.0.0.1`, and the LAN IP refuses the connection. A foreign `Host` gets 403, `Sec-Fetch-Site: cross-site` gets 403, a non-JSON body gets 415, and a CORS preflight is not approved.
  - The web UI is served at `/`.
  - After the WWR fix, on a fresh database:
    - WWR was enabled by default and its read was `capped`. It added 27 postings, and the next read was due in 1 h.
    - One role that Collibra posted twice on WWR, 8 s apart, was shown as one posting (AC-04).
    - 21 of the 27 have an unknown location (AC-22).
    - The bullets above were recorded before this fix, so they still show WWR as disabled.
- Deferred: closure, re-post, 30% hold-back and failure flags over time (AC-03, AC-07–AC-14, AC-20, AC-25) can't be produced on demand against live boards. They are covered by the end-to-end test against a fake source server (`collector-e2e.integration.test.ts`) and the integration tests.

## Operational notes

- Migration: run `pnpm --filter @job-radar/server db:migrate` before starting. The server does not migrate on start and fails with `no such table: collector_sources`. Rollback: restore the `*.bak-<timestamp>` copy that `db:migrate` makes; the staged `migrations/*.down.sql` undo the schema by hand (05→01).
- Runtime: Node 22 is required (better-sqlite3 ABI). Settings live in `settings.json` next to `DATABASE_FILE`. `HOST` must stay loopback.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019PDFQtem7YfBksryS99hh6
