---
id: T7
title: "Run a search: save skills, scan open postings, order, mark new, keep an in-memory snapshot"
layer: "app"
deps: ["T2", "T3", "T4", "T5", "T6"]
blocks: ["T8"]
acs: ["AC-01", "AC-04", "AC-10", "AC-11", "AC-12"]
files_hint: ["apps/server/src/modules/search/app/search.ts", "apps/server/src/modules/search/app/snapshots.ts", "apps/server/src/modules/search/app/present.ts", "apps/server/test/search-run.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 72
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T7 — Run a search: save skills, scan open postings, order, mark new, keep an in-memory snapshot

## Place in the sequence

- **Blocked by:** T2 — skills, T3 — matcher, T4 — order/visit/links, T5 — collector export, T6 — state + visits · **Blocks:** T8 — Next page and waiting count · **Wave:** 3.
- **Lane:** own lane. Creates `snapshots.ts` and `present.ts` (posting → API shape), which T8 reuses.

## Why (user story)

> **As an** owner
> **I want** to enter my skills and get the open postings that mention at least one of them, newest first
> **So that** I see the roles I could do without opening every board
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** the list with no skills entered to show every open posting, newest first
> **So that** the main screen works as my feed of what job-radar has collected
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

The core use case behind `runSearch` (search, feed and refresh are all this call).

## Inlined context

> S->>S: parses the skills, drops empty and duplicate entries, checks the rules · alt fails → rejected, naming the skill or count and the rule · else → S->>D: saves the skills as the last skills, none when the field is empty (persists before the collection is read) · S->>D: reads open postings via the collector export · alt cannot be read → collection unavailable · else no postings yet → empty collection · else no open posting matches → nothing matches · else found or empty field → matches, orders newest first by effective time, marks new since the previous visit · keeps the ordered ids as a snapshot in memory · first 50 with matched skills and in-title flags, total, new count, snapshot id
>
> — `sad.md §6, flow 3, abridged` · full text: [sad.md](../sad.md)

> **Snapshots.** Held in the search module's memory only: snapshot id (UUIDv7), skills, loaded-at moment, the previous-visit start used for new marks, the ordered posting ids, and the new count. […] an unknown or expired snapshot answers with a dedicated error code
>
> — `sad.md §5, Snapshots, abridged`

> Snapshots: at most 20 kept, the oldest evicted first, each expiring after 2 h idle
>
> — `sad.md §7, Scaling thresholds, verbatim`

> **Chosen:** Option 1. The snapshot makes "no repeats, no gaps" true by construction, and a next page costs no rescan.
>
> — `adr/0003-page-results-from-an-in-memory-snapshot-of-ordered-ids.md §Decision outcome, abridged` · full text: [ADR-0003](../adr/0003-page-results-from-an-in-memory-snapshot-of-ordered-ids.md)

> Logs: pino child logger `module=search`; one line per search with `durationMs`, `openPostings`, `matched` and `skillCount` — never the skills' text or any posting text.
>
> — `sad.md §7, Monitoring, verbatim`

> descriptions are not sent to the web at all. A link is sent only when its protocol is `http:` or `https:`
>
> — `sad.md §8, Untrusted source content, abridged`

A refresh never starts a new visit — the snapshot's previous-visit start is read from `search_state`, not rolled (flow 5).

**Fallback:** [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) · [ADR-0003](../adr/0003-page-results-from-an-in-memory-snapshot-of-ordered-ids.md). Do not guess.

## Data delta

Writes `search_state.last_skills` (via T6 `saveLastSkills`) before reading postings; reads `previous_visit_started_at`. Collector tables read-only via T5. — `data-model.md §Entities, abridged`

## API contract

`runSearch` (`POST /api/v1/search/snapshots`, wired in T9) → `200 SearchResult`:
`{ snapshot_id, skills[], total, new_count, collection_empty, items: Posting[≤50], has_next, next_cursor: "50"|null }`
`Posting { id, title, company, published_at|null (effective, capped), first_seen_at, is_new, matched_skills[{skill,in_title}], listings[{source_id, status, url|null, location_restriction|null}] }`
Errors this use case raises: `400 SEARCH_INVALID_SKILLS` (T2 message), `503 SEARCH_COLLECTION_UNAVAILABLE` ("Job-radar could not read its postings just now. Try again.").
"Nothing matches" and "collection empty" are `200 total: 0`, told apart by `collection_empty`.

— `contracts/openapi.yaml, operationId runSearch + schemas Posting/Listing/SearchResult, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** the collection holds open postings, some of which mention "React" or "TypeScript" in their title or description
> **When** the owner searches for the skills "React, TypeScript"
> **Then** the owner sees exactly the open postings that mention at least one of the two skills, newest first, with the number of postings found
>
> — `spec.md §5, AC-01, verbatim`

### AC-04 — cross-context

> **Given** the collector has marked a posting closed, and has reopened another one
> **When** the owner searches with a skill both postings mention
> **Then** the closed posting is not in the list and the reopened one is — the list shows only postings the collector holds open at the moment of the search
>
> — `spec.md §5, AC-04, verbatim`

### AC-10 — happy

> **Given** the skills field is empty
> **When** the owner opens the main screen or searches
> **Then** they see every open posting, newest first, with the total number of open postings and no matched skills on any posting
>
> — `spec.md §5, AC-10, verbatim`

### AC-11 — error

> **Given** the collection holds no open posting that mentions any of the owner's skills — or holds no postings at all yet
> **When** the owner searches
> **Then** the owner sees that nothing matches, with the skills they used and one action to clear them; when the collection is still empty, the message says the first collection has not brought postings yet and points to source health
>
> — `spec.md §5, AC-11, verbatim`

### AC-12 — error

> **Given** the owner searches while job-radar cannot read its collection
> **When** the search fails
> **Then** the owner sees a plain-language message with a retry action next to the list, their skills stay in the field, and the last list shown stays visible
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/app/snapshots.ts`: in-memory store (`create`, `get` touching idle time, cap 20 evict-oldest, 2 h idle expiry, clock injected).
- [ ] `search/app/present.ts`: posting → `Posting` (effective `published_at`, `is_new`, `matched_skills`, listings with `safeUrl` only on open listings, epoch → ISO).
- [ ] `search/app/search.ts`: `runSearch(deps, skillsText)` — parse (T2) → `AppError` 400 · save last skills · read export (failure → `AppError` 503) · match/order/new · snapshot · first 50; one log line per §7.
- [ ] `apps/server/test/search-run.integration.test.ts` (temp DB, fake clock).

## Edge cases

| Case | Behaviour |
|---|---|
| Invalid skills | 400, `last_skills` **not** written, no snapshot |
| Export throws | 503, `last_skills` already saved |
| Empty skills | feed: all open, `matched_skills: []`, `last_skills` saved as `NULL` |
| No open postings at all | `total 0`, `collection_empty: true` |
| Postings exist, none match | `total 0`, `collection_empty: false` |
| ≤ 50 results | `has_next: false`, `next_cursor: null` |
| 21st snapshot | oldest evicted |

## Definition of Done

- [ ] integration tests cover AC-01, AC-04, AC-10, AC-11 (both variants), AC-12 (export stubbed to throw: 503 + skills saved)
- [ ] a `new_count`/`is_new` assertion with a seeded previous visit; nothing new when previous is null
- [ ] log line carries no skill or posting text
- [ ] lint + vet clean
