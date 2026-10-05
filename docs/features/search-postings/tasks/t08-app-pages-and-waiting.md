---
id: T8
title: "Serve next pages from a snapshot and count waiting postings"
layer: "app"
deps: ["T7"]
blocks: ["T9"]
acs: ["AC-15", "AC-16"]
files_hint: ["apps/server/src/modules/search/app/pages.ts", "apps/server/src/modules/search/app/waiting.ts", "apps/server/test/search-pages.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
# measured inlined lines: 37
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T8 — Serve next pages from a snapshot and count waiting postings

## Place in the sequence

- **Blocked by:** T7 — Run a search and keep its snapshot · **Blocks:** T9 — Routes and wiring · **Wave:** 4.
- **Lane:** own lane. Reuses `snapshots.ts`, `present.ts` (T7), `touchVisit` (T6), `postingsByIds` / `openPostings({foundAfter})` (T5).

## Why (user story)

> **As an** owner
> **I want** results 50 at a time with the total shown, and more on request, without repeats or gaps while collection runs
> **So that** a long list stays fast on my phone and I can trust I have seen all of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Show-more and the waiting count — the two calls that keep a loaded list stable while collection runs.

## Inlined context

> loop every 60 s and on window focus while the main screen is visible: asks how many postings are waiting for the snapshot · Search->>DB: touches the current visit · streams open postings first collected after the snapshot loaded · waiting count. Owner asks for more → next page of the snapshot · alt snapshot known → reads the next 50 postings by id · current details, closed ones left out · next 50 in snapshot order · else snapshot expired or server restarted → snapshot expired
>
> — `sad.md §6, flow 2, abridged` · full text: [sad.md](../sad.md)

> alt the collection cannot be read → collection unavailable · retries → same next page of the snapshot
>
> — `sad.md §6, flow 5, abridged`

> Spec AC-15 / AC-16 say no posting after the last one shown is skipped; this design leaves out a posting closed after the list loaded (closed postings are never shown, spec §3) — ADR-0003, §10 QG-3 | Low | Patch AC-16's wording in `spec.md` ("…none that belonged after the last one shown is skipped, except postings the collector closed since the list was loaded")
>
> — `sad.md §11, risk row AC-15/AC-16, verbatim` (spec not yet patched — the design behaviour above is binding)

Waiting count = postings that **match the snapshot's skills** (all, for the feed) and were first collected after the snapshot's loaded-at.

**Fallback:** [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) · [ADR-0003](../adr/0003-page-results-from-an-in-memory-snapshot-of-ordered-ids.md). Do not guess.

## Data delta

No DB changes. Writes `search_state.visit_last_seen_at` via T6 `touchVisit` on each waiting call.

## API contract

- `getNextPage` `POST /api/v1/search/snapshots/{snapshot_id}/pages` body `{ cursor: "^[0-9]{1,6}$" }` → `200 PostingPage { items[≤50], has_next, next_cursor|null }` · errors `410 SEARCH_SNAPSHOT_EXPIRED`, `503 SEARCH_COLLECTION_UNAVAILABLE`. Retrying the same cursor after a 503 returns the same page.
- `getWaitingCount` `POST /api/v1/search/snapshots/{snapshot_id}/waiting` body `{}` → `200 { waiting_count }` · errors `410`, `503`.

— `contracts/openapi.yaml, operationIds getNextPage + getWaitingCount, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-15 — happy

> **Given** a search finds 130 postings
> **When** the list is shown and the owner asks for more twice
> **Then** they first see the newest 50 with "130 postings", then 100, then all 130, in the same order as one long list would have
>
> — `spec.md §5, AC-15, verbatim`

### AC-16 — domain invariant

> **Given** the owner has 50 postings on screen and a collection run adds, merges, reopens or closes postings
> **When** the owner asks for more
> **Then** no posting already on screen appears again and none that belonged after the last one shown is skipped; postings collected after the list was loaded are not inserted into it — the owner is told how many new postings are waiting and can refresh the list; a posting the collector closes while it is on screen stays on screen until the list is refreshed
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/app/pages.ts`: `nextPage(deps, snapshotId, cursor)` — unknown → `AppError` 410; slice `[cursor, cursor+50)` of ids; `postingsByIds` (read failure → 503); keep snapshot order; present with the snapshot's skills + previous-visit start.
- [ ] `search/app/waiting.ts`: `waitingCount(deps, snapshotId)` — 410 if unknown; `touchVisit`; `openPostings({foundAfter: loadedAt})` → match with the snapshot's skills → count.
- [ ] `apps/server/test/search-pages.integration.test.ts`.

## Edge cases

| Case | Behaviour |
|---|---|
| Cursor beyond the end | `items: []`, `has_next: false` |
| Posting closed after load | left out of its page; no other id shifts |
| Merge moves a posting's time earlier | snapshot order unchanged |
| Posting added after load | not in pages; counted as waiting if it matches |
| Snapshot evicted / restart | 410 |
| Read fails, retried | same page returned |

## Definition of Done

- [ ] integration test: 130 results → 50 / 100 / 130 in one-long-list order (AC-15)
- [ ] integration test: mutate after load (add, close, merge) → no repeats, no shifts, waiting count = matching additions (AC-16)
- [ ] 410 on unknown id, 503 retry returns the same page
- [ ] lint + vet clean
