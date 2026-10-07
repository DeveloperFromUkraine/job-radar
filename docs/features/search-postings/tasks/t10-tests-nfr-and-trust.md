---
id: T10
title: "Prove the NFRs end to end: 10k-posting latency, currency, paging under a live run, late arrivals"
layer: "tests"
deps: ["T9"]
blocks: []
acs: ["AC-01", "AC-14", "AC-16"]
files_hint: ["apps/server/test/helpers/search-fixtures.ts", "apps/server/test/search-nfr.integration.test.ts", "apps/server/test/search-trust.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 45
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Prove the NFRs end to end: 10k-posting latency, currency, paging under a live run, late arrivals

## Place in the sequence

- **Blocked by:** T9 — Routes and wiring · **Blocks:** — · **Wave:** 6 (last server task).
- **Lane:** own lane; test-only files.

## Why (user story)

> **As an** owner
> **I want** results 50 at a time with the total shown, and more on request, without repeats or gaps while collection runs
> **So that** a long list stays fast on my phone and I can trust I have seen all of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

The quality-goal tests that guard every later build (sad §10 QG-1 currency, QG-2, QG-3).

## Inlined context

| Aspect | Target | Measurement |
|---|---|---|
| Search response | ≤ 1 s p95 from the owner pressing search (or opening the main screen) to the first 50 postings shown, with 10,000 open postings in the collection and up to 20 skills | integration test against a temporary database seeded with 10,000 postings of realistic description length; p95 over 50 searches |
| Show more | ≤ 1 s p95 from asking for more to the next 50 shown, same collection | same test, measured per page |
| Currency | 100% of postings from collection runs that finished before the search started are present in its results | integration test: finish a run, search, the run's postings are present |

— `spec.md §6, NFR rows 1–3, verbatim` · full text: [spec.md](../spec.md)

> **QG-1 How verify:** […] integration test: finish a run against fake sources, search, assert every posting the run added is present.
> **QG-3 How verify:** integration test with a fake clock and fake sources: load, run a mutating collection, page twice, assert ids, order and the waiting count; integration test for AC-14 with a posting published two days earlier and first collected after the previous visit started.
>
> — `sad.md §10, QG-1 / QG-3 How verify, abridged` · full text: [sad.md](../sad.md)

> `seedOpenPostings(db, n, overrides)` — `n` open postings, each with ≥ 1 listing of realistic description length. Company `Example Co`, URLs `https://jobs.example.test/<id>`. […] `setSearchState(db, partial)` — upserts the singleton row to set up visit scenarios (AC-13, AC-14) under a fake clock.
>
> — `data-model.md §Test fixtures, abridged` · full text: [data-model.md](../data-model.md)

Existing helpers to reuse: `test/helpers/temp-db.ts`, `test/helpers/fake-sources.ts` (collector runs via collect-now, as `collector-e2e.integration.test.ts` does).

**Fallback:** [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md). Do not guess.

## Data delta

No DB changes (fixtures insert into existing tables).

## API contract

Exercises `openVisit`, `runSearch`, `getNextPage`, `getWaitingCount` over HTTP (`app.inject`) — shapes per T9. — `contracts/openapi.yaml, paths, abridged`

## Acceptance criteria

### AC-01 — happy

> **Given** the collection holds open postings, some of which mention "React" or "TypeScript" in their title or description
> **When** the owner searches for the skills "React, TypeScript"
> **Then** the owner sees exactly the open postings that mention at least one of the two skills, newest first, with the number of postings found
>
> — `spec.md §5, AC-01, verbatim`

### AC-14 — happy

> **Given** the owner's previous visit to the main screen started yesterday at 09:00, and since then the collector added postings — including one published two days ago that a slower source delivered this morning
> **When** the owner opens the main screen
> **Then** every posting first collected after yesterday 09:00 is marked new — the late one included, in its publication-time position — and the screen shows how many of the listed postings are new
>
> — `spec.md §5, AC-14, verbatim`

### AC-16 — domain invariant

> **Given** the owner has 50 postings on screen and a collection run adds, merges, reopens or closes postings
> **When** the owner asks for more
> **Then** no posting already on screen appears again and none that belonged after the last one shown is skipped; postings collected after the list was loaded are not inserted into it — the owner is told how many new postings are waiting and can refresh the list; a posting the collector closes while it is on screen stays on screen until the list is refreshed
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md) (closed-since-load exception: sad §11)

## Checklist

- [ ] `test/helpers/search-fixtures.ts`: `seedOpenPostings`, `setSearchState`.
- [ ] `search-nfr.integration.test.ts`: 10,000 postings (~5 KB descriptions), 20 skills; p95 of 50 `runSearch` ≤ 1000 ms; p95 per `getNextPage` ≤ 1000 ms.
- [ ] `search-trust.integration.test.ts`: currency after a fake-source run; 130-result paging under a mutating run (add, merge earlier, reopen, close) + waiting count; AC-14 late arrival is `is_new` and sits at its publication-time position.

## Edge cases

| Case | Behaviour |
|---|---|
| Slow CI machine | perf test may be tagged/skippable via env, never silently loosened |
| Reopened posting after previous visit | not new |
| Run finishes mid-search | only runs finished **before** the search started are asserted |

## Definition of Done

- [ ] latency tests pass at the spec's thresholds (≤ 1 s p95, both)
- [ ] currency, paging-under-run and late-arrival tests pass
- [ ] lint + vet clean
