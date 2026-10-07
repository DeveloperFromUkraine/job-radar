---
id: T17
title: "Prove marks hold through every collector event and a restart, and that marking stays under 300 ms p95"
layer: "tests"
deps: ["T08", "T10", "T11"]
blocks: []
acs: ["AC-08", "AC-09"]
files_hint: ["apps/server/test/tracking-collector-events.integration.test.ts", "apps/server/test/tracking-nfr.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T17 — Prove marks hold through every collector event and a restart, and that marking stays under 300 ms p95

## Place in the sequence

- **Blocked by:** T08 — Implement ProtectedPostings in tracking and wire it into the collector in app.ts, T10 — Expose setMark and undoMark as Fastify routes behind the access guard and register the tracking plugin, T11 — Make search's main list mark-aware: snapshot keeps marked, pages skip them, counts and hints · **Blocks:** — · **Wave:** 5 (after its deps finish).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** my marks to hold when boards merge, close, reopen or re-list a posting, and when job-radar restarts
> **So that** a decided posting doesn't come back on its own
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The guard that a decided posting never comes back on its own — the feature's top quality goal.

## Inlined context

> QG-1 When: the owner has marked postings applied and skipped. Then the collector merges another listing into one, closes one, reopens one and updates one's text; job-radar restarts; daily clean-up runs with one skipped and one applied posting past the 60-day limit. Then: Every marked posting keeps its mark and first-collected time, never re-enters the main list, and is not counted as new (AC-08). Clean-up removes the skipped posting and keeps the applied one (AC-09). How verify: A server integration test over every collector event (merge, close, reopen, update, restart, clean-up) with real tracking marks.
>
> — `sad.md §10, QG-1, abridged` · full text: [sad.md](../sad.md)

> Mark response: ≤ 300 ms p95 from the owner pressing applied / skipped to the posting leaving the list — integration test over 100 marks against a collection of 10,000 open postings. Durability: 100% of marks confirmed to the owner survive a restart; a mark is confirmed only once saved — integration test: mark, restart, reload; failure path per AC-14
>
> — `spec.md §6, Mark response + Durability, verbatim` · full text: [spec.md](../spec.md)

> **Code fact:** collector events are driven in tests through `executeRun(deps, run, protectedPostings)` with `test/helpers/fake-sources.ts` (see `collector-e2e.integration.test.ts`); search fixtures in `test/helpers/search-fixtures.ts` (`seedOpenPostings`).
>
> — `apps/server/test/collector-e2e.integration.test.ts, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Seeds via `seedMarks` (T06) and `seedOpenPostings`.

## API contract

Drives `setMark` over HTTP (`app.inject`) and `runSearch` / `getNextPage` / `getWaitingCount` to assert the list.

— `contracts/openapi.yaml, setMark / runSearch, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-08 — cross-context

> **Given** the owner has marked a posting applied or skipped
> **When** the collector merges another source's listing into it, closes it, reopens it, or updates its text, or job-radar restarts
> **Then** the posting keeps its mark and its first-collected time, never re-enters the owner's list, and is not counted as new
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — cross-context

> **Given** one skipped and one applied posting are each past the collector's 60-day clean-up limit (more than 60 days since closing, or since any enabled source last offered it, with days when all its sources were disabled not counted)
> **When** the collector's daily clean-up runs
> **Then** the skipped posting is removed exactly as an unmarked one would be, and the applied posting is kept for good, whatever its age
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tracking-collector-events.integration.test.ts`: mark, then merge / close / reopen / update / restart / clean-up; after each, assert mark kept, `first_seen_at` kept, not in list, not new
- [ ] `tracking-nfr.integration.test.ts`: 10,000 open postings, 100 marks over HTTP, p95 ≤ 300 ms; mark → close app → reopen same DB file → marks present

## Edge cases

| Case | Behaviour |
|---|---|
| Posting reopened by a source | Still marked, still out of the list, not new |
| Another source's listing merged in | Mark kept on the merged posting |
| Restart mid-session | Every confirmed mark present |

## Definition of Done

**Done when:** tracking-collector-events.integration.test.ts passes over merge, close, reopen, text update, restart (reopen the DB file) and clean-up with real marks; tracking-nfr.integration.test.ts shows ≤300 ms p95 over 100 marks against 10,000 open postings and 100% of confirmed marks surviving a restart.

- [ ] both integration tests pass in CI time limits
- [ ] mark-response p95 printed in the test output
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
