---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "roadmap step 2 — remote-boards-collector"
---

# 0004 — Normalize sources through one adapter contract with per-source close signals

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

Each source differs in shape, paging, freshness and what it can say about a listing being gone. A posting may close only when every enabled source listing it confirms it is no longer open (a disabled source's listing does not count; at least one must confirm — spec AC-07, AC-26, clarified 2026-10-02), and a failed, cut-short or most-recent-only fetch must never close anything (CONTEXT "Closed posting", AC-07, AC-08, AC-09). Spec §8 Q2 asks design to name each source's closing signal; with none named, a source never auto-closes. Source behaviour verified 2026-10-02 from each source's API documentation: Remotive returns all active listings per category; Himalayas returns ≤ 20 records per request with an `expiryDate` per job; Jobicy returns only the last 7 days, ≤ 200 per request.

## Decision drivers

- No false closures — KPI "0 of 20 spot-checked closed postings still open" (spec §7).
- A failed or partial fetch never closes a posting (CONTEXT invariant).
- LinkedIn and ATS boards plug into the same source contract later (spec §3, roadmap steps 9, 10).
- Request limits count pages (spec §6) — an adapter must stop when its read budget is used up.

## Considered options

1. **One adapter contract + per-source signals, Jobicy closes inside its window** — Remotive: one unfiltered request per run (categories filtered locally), absent from that complete fetch; Himalayas: `expiryDate` passed; Jobicy: absent from an untruncated response (fewer items than requested) while its publication time is inside the 7-day window minus a 12-hour margin; We Work Remotely: none.
2. **One adapter contract + per-source signals, Jobicy never auto-closes** — as option 1 but Jobicy listings only age out.

## Decision outcome

**Chosen:** Option 1. Every adapter returns `{ listings, completeness: complete | capped | partial | failed, closeSignals }`, where `listings` are already normalized (plain-text fields, location restriction as stated or `unknown`, categories); the collector's domain alone turns a verdict into listing closures, and only for `complete` fetches or direct signals. Letting Jobicy confirm closures inside its window keeps merged postings with a Jobicy listing closable — Jobicy is the freshness source, so most merged postings carry one.

| Source | Completeness | Closing signal | Never closes on |
|---|---|---|---|
| Remotive | `complete` when the single unfiltered request succeeded — one read per run, inside ≤ 4 a day | listing absent from that complete fetch | failed or partial fetch |
| Himalayas | `capped` (≤ 20 per request, ≤ 4 requests a day) | `expiryDate` in the past | absence |
| Jobicy | `complete` within the window when the response has fewer items than requested, else `capped` | absent from a complete response and published after (now − 7 days + 12 h) | a listing older than the window; a capped response |
| We Work Remotely | — (disabled) | none — ages out only (AC-10) | anything |

## Consequences

**Positive**
- Closing logic lives in one pure domain place, testable per source with recorded fixtures.
- New sources only implement the adapter; spec §8 Q2 is answered.

**Negative**
- A Jobicy listing older than 7 days can no longer be confirmed closed, so a posting holding one closes only by the 60-day age-out (§11).
- If Jobicy changes its window, closures could be wrong — guarded by the 30% hold-back (AC-14) and the window margin.

**Neutral**
- Himalayas closures depend on employers setting realistic expiry dates; a missing `expiryDate` means no signal.

## Links

- Spec: [[../spec.md]] AC-03, AC-07, AC-08, AC-09, AC-14, §8 Q2
- SAD: [[../sad.md]] §4, §5, §11
- Related ADR: [[0003-drive-collection-from-a-one-minute-due-check-over-persisted-state]], [[0005-store-postings-and-listings-separately-and-merge-at-collection-time]]
