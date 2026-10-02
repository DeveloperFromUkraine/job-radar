---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "roadmap step 2 — remote-boards-collector"
---

# 0003 — Drive collection from a one-minute due-check over persisted state

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

Sources must be read on their own cadence (Jobicy 1 h, Remotive 6 h, Himalayas 6 h) without ever exceeding published limits counted over rolling 60-minute / 24-hour windows, pages and failed requests included (spec §6). The laptop sleeps, the app restarts (including `tsx watch` restarts in development), runs can be cut off mid-way (AC-20), collect-now can be pressed at any time (AC-15, AC-16) and catch-up must start within a minute of start (AC-18).

## Decision drivers

- Never above a source's published limit (spec §6 "Source request rate"), also across restarts — protects the owner's address from being blocked (spec §6.1).
- At most one collection run in progress (CONTEXT invariant, AC-16).
- Catch-up within one minute of start (AC-18); interrupted runs recorded as incomplete and never blocking (AC-20).
- Deterministic tests with a fake clock (architecture-map test conventions).

## Considered options

1. **One-minute due-check over persisted state** — a tick (every 60 s and once at start) computes due sources from a persisted request ledger and last-success times; a `collection_run` row in status `running` is the run lock.
2. **Persist only each source's last read time** — the same due-check, but the database keeps one "last read at" per source instead of a request ledger.
3. **A persisted job-queue library** — a ready-made scheduler storing jobs in SQLite.

## Decision outcome

**Chosen:** Option 1. Persisting every request before it is sent makes the rolling-window limit hold across sleep, crash and restart and counts pages and failed requests (option 2 cannot: one timestamp per source does not count a multi-page Himalayas fill or a failed request inside a rolling 24-hour window, spec §6); a due-check needs no special path for catch-up or sleep; a queue library (option 3) would still need our own rolling-window and one-run-for-all-sources rules on top of its own tables.

## Consequences

**Positive**
- Limits, catch-up, interrupted-run recovery and collect-now share one rule: "which sources may be read now?".
- Each piece is a pure function of (now, ledger, settings) — unit-testable without timers.

**Negative**
- Up to 60 s between a source becoming due and its read (inside AC-18's one minute and the 2 h freshness budget).
- The ledger grows; entries older than 24 h are pruned by the daily clean-up.

**Neutral**
- A request recorded but never sent (crash between write and send) counts against the limit — deliberately conservative (AC-20: "every read it made counts").

## Links

- Spec: [[../spec.md]] AC-02, AC-15, AC-16, AC-18, AC-20, §6
- SAD: [[../sad.md]] §4, §5, §6
- Related ADR: [[0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals]]
