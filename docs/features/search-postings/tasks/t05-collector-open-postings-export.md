---
id: T5
title: "Add the collector's read-only open-postings export (stream, after-moment, by id)"
layer: "infra"
deps: []
blocks: ["T7"]
acs: ["AC-04", "AC-08"]
files_hint: ["apps/server/src/modules/collector/app/open-postings.ts", "apps/server/src/modules/collector/infra/repo/open-postings.ts", "apps/server/test/collector-open-postings.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 51
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T5 — Add the collector's read-only open-postings export (stream, after-moment, by id)

## Place in the sequence

- **Blocked by:** — · **Blocks:** T7 — Run a search and keep its snapshot · **Wave:** 1 (no deps).
- **Lane:** own lane. Touches only **new** files in `collector/` — roadmap step 11 works in `collector/infra/sources/` in parallel; do not edit there.

## Why (user story)

> **As an** owner
> **I want** each posting to show its title, company, publication time and location restriction, and to name and link every source that lists it
> **So that** I can check where I may work from and apply on the board I prefer
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The search's only window onto postings: open postings with their listings, read without writing.

## Inlined context

> **Chosen:** Option 1. […] Option 1 reads the source of truth directly through the collector's `app` layer.
>
> — `adr/0001-ship-search-as-new-server-module-plus-main-screen-list.md §Decision outcome, abridged` · full text: [ADR-0001](../adr/0001-ship-search-as-new-server-module-plus-main-screen-list.md)

> `modules/collector/app/open-postings.ts` NEW read-only export: streams open postings with their open listings' text plus closed listings' source + status, optionally only those first collected after a moment; reads postings by id
>
> — `sad.md §5, internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> Postings, listings and their open/closed state belong to the collector module (`collector_postings`, `collector_listings`; collector ADR-0005). This feature reads them; it never writes them.
>
> Layering […]: a module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, abridged`

> Postings are read through the collector export. It filters open postings, filters by first collected after a moment (flow 2 waiting count) and reads by id (flows 2, 5).
>
> — `sad.md §6, Flags, verbatim`

Queries stay in `collector/infra/` (CLAUDE.md: queries only inside `infra/`); `collector/app/open-postings.ts` is the export search imports.

**Fallback:** [sad.md](../sad.md) · [data-model.md](../data-model.md) · `apps/server/src/modules/collector/infra/schema.ts`. Do not guess.

## Data delta

Read-only; no schema change, no new index.

| Search need | Collector column(s) | Rule |
|---|---|---|
| Open postings only (AC-04) | `collector_postings.status` | `= 'open'` |
| Matching text (AC-02, AC-06) | open `collector_listings.title`, `.description` | Closed listings never match |
| Effective time (AC-03) | `collector_postings.published_at`, `.first_found_at` | |
| Waiting count (AC-16) | `collector_postings.first_found_at` | `> snapshot loaded-at` |
| Card (AC-07, AC-08, AC-09) | posting `title`, `company`; each listing's `source_id`, `status`, `url`, `location_restriction` | |
| Tie order (AC-03) | `collector_postings.id` | UUIDv7 |

— `data-model.md §Read from the collector, abridged` · full text: [data-model.md](../data-model.md)

Measured plan: full stream = `SCAN collector_postings` → `collector_listings_posting_idx`, 270 ms p95 at ~27k open; after-moment 3.9 ms; 50 by id 0.9 ms — `data-model.md §Indexes, abridged`.

## API contract

Internal — no API surface. In-process export shape (proposal; keep minimal):
`OpenPosting { id, title, company, publishedAt, firstFoundAt, listings: { sourceId, status, url, locationRestriction, title?, description? }[] }` — `title`/`description` only on open listings.

## Acceptance criteria

### AC-04 — cross-context

> **Given** the collector has marked a posting closed, and has reopened another one
> **When** the owner searches with a skill both postings mention
> **Then** the closed posting is not in the list and the reopened one is — the list shows only postings the collector holds open at the moment of the search
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a posting listed by Jobicy and Himalayas, where Himalayas has confirmed its listing closed but Jobicy still offers it
> **When** the posting is shown
> **Then** the source of every listing is named — Jobicy with its link, Himalayas marked "closed at Himalayas" without a link — so the source of any text shown is always credited (board terms require attribution), and the posting is never shown without at least one linked open source
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `collector/infra/repo/open-postings.ts`: `openPostings(db, {foundAfter?})` (open postings + all their listings, text only for open listings) and `postingsByIds(db, ids)` (current state, open only).
- [ ] `collector/app/open-postings.ts`: re-export the two reads as the module's public read API, typed `OpenPosting`.
- [ ] `apps/server/test/collector-open-postings.integration.test.ts` on `createTempDb()` with plain inserts.

## Edge cases

| Case | Behaviour |
|---|---|
| Posting closed | absent from stream and from by-id |
| Posting reopened | present |
| Open posting, one listing closed | posting present; closed listing has source + status, no title/description |
| `foundAfter` set | only postings with `first_found_at > foundAfter` |
| By-id with an id since closed / removed | left out, order of remaining ids preserved by caller |
| Empty collection | empty result, no error |

## Definition of Done

- [ ] integration test proves AC-04 (closed out, reopened in) and the AC-08 shape (closed listing named, no text)
- [ ] no write statement and no edit to existing collector files except an export line if needed
- [ ] lint + vet clean
