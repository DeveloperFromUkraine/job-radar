---
id: T6
title: "Keep search state and record visits (repo + openVisit / heartbeat use cases)"
layer: "app"
deps: ["T1", "T4"]
blocks: ["T7"]
acs: ["AC-13", "AC-14"]
files_hint: ["apps/server/src/modules/search/infra/repo.ts", "apps/server/src/modules/search/app/visits.ts", "apps/server/src/modules/search/app/deps.ts", "apps/server/test/search-visits.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
# measured inlined lines: 44
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T6 — Keep search state and record visits (repo + openVisit / heartbeat use cases)

## Place in the sequence

- **Blocked by:** T1 — Promote the search_state schema, T4 — Ordering, visit rule, safe links · **Blocks:** T7 — Run a search and keep its snapshot · **Wave:** 2.
- **Lane:** own lane. Creates `search/app/deps.ts` (db + injected clock), which T7/T8 extend.

## Why (user story)

> **As an** owner
> **I want** job-radar to remember the skills I searched last
> **So that** opening the app shows my list straight away without retyping
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Reads/writes the one `search_state` row and turns "main screen opened" into the visit bookkeeping AC-14 needs.

## Inlined context

> **State kept by search.** One `search_state` row: the last skills that passed the check, saved before the collection is read so a failed read still remembers them (none = empty field next time, AC-13, ux-flows US-05), the current visit's start and last-seen time, and the previous visit's start (AC-14). Kept on the server, not in browser storage, so the dev (`:5173`) and built (`:3000`) origins share it and "new" is decided against the same clock that stamped "first collected".
>
> — `sad.md §5, State kept by search, abridged` · full text: [sad.md](../sad.md)

> Web->>Search: records the visit · Search->>DB: reads search state · Note over Search: over 30 min since last seen starts a new visit and the old one becomes the previous visit · Search->>DB: saves visit times · Search-->>Web: remembered skills and visit
>
> — `sad.md §6, flow 1 steps 2–6, abridged`

> loop every 60 s … Web->>Search: asks how many postings are waiting for the snapshot · Search->>DB: touches the current visit
>
> — `sad.md §6, flow 2 loop, abridged` (the waiting route itself is T8; this task provides `touchVisit`)

The visit rule itself is `search/domain/visit.ts` (T4) — call it, do not re-implement.

**Fallback:** [sad.md](../sad.md) · [data-model.md](../data-model.md). Do not guess.

## Data delta

| Column | Type | Change |
|---|---|---|
| `id` | integer PK (=1) | read/upsert (`onConflictDoNothing`, lazily) |
| `last_skills` | text (JSON array) | read; written by `saveLastSkills` (`NULL` for none) |
| `visit_started_at`, `visit_last_seen_at`, `previous_visit_started_at` | integer | read/written |

— `data-model.md §Entities, search_state, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Feeds `POST /api/v1/search/visits` (`openVisit`, wired in T9) → `200 Visit`:
`{ last_skills: string[] /* empty = none */, previous_visit_started_at: string|null /* ISO UTC */ }`

— `contracts/openapi.yaml, operationId openVisit, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-13 — happy

> **Given** the owner last searched for "React, Go" and closed the app
> **When** the owner opens the main screen again
> **Then** the skills field holds "React, Go" and the list is a fresh search for them; after the owner clears the skills and searches, the next opening starts with an empty field
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy (visit part)

> **Given** the owner's previous visit to the main screen started yesterday at 09:00, and since then the collector added postings — including one published two days ago that a slower source delivered this morning
> **When** the owner opens the main screen
> **Then** every posting first collected after yesterday 09:00 is marked new — the late one included, in its publication-time position — and the screen shows how many of the listed postings are new
>
> > A visit starts when the owner opens the main screen after more than 30 minutes without it open; searching, paging and refreshing during a visit do not start a new one. […] On the owner's very first visit there is no previous visit, so nothing is marked new.
>
> — `spec.md §5, AC-14 + note, abridged` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/infra/repo.ts`: `readState(db)`, `saveVisit(db, times)`, `saveLastSkills(db, skills|null)` — the only SQL in the module.
- [ ] `search/app/deps.ts`: `SearchDeps { db, now }`.
- [ ] `search/app/visits.ts`: `openVisit(deps)` → `{ lastSkills, previousVisitStartedAt }` via `nextVisit`; `touchVisit(deps)` refreshes last-seen only.
- [ ] `apps/server/test/search-visits.integration.test.ts` with a fake clock.

## Edge cases

| Case | Behaviour |
|---|---|
| No row yet | upsert row 1; first visit; `last_skills: []`, previous `null` |
| Open again 10 min later | same visit; previous unchanged |
| Open again 31 min after last seen | new visit; previous = old current start |
| `last_skills` `NULL` | `[]` |
| `touchVisit` | never starts a new visit |

## Definition of Done

- [ ] integration test: remembered skills round-trip ("React, Go" → `["React","Go"]`; cleared → `[]`)
- [ ] integration test: 10-min reopen keeps the visit, 31-min reopen rolls it, first visit has `previous = null`
- [ ] lint + vet clean
