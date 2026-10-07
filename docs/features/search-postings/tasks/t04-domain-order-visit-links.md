---
id: T4
title: "Implement effective-time ordering, the visit/new-mark rule and the safe-link check"
layer: "domain"
deps: []
blocks: ["T6", "T7"]
acs: ["AC-03", "AC-09", "AC-14"]
files_hint: ["apps/server/src/modules/search/domain/order.ts", "apps/server/src/modules/search/domain/visit.ts", "apps/server/src/modules/search/domain/links.ts", "apps/server/src/modules/search/domain/order.test.ts", "apps/server/src/modules/search/domain/visit.test.ts", "apps/server/src/modules/search/domain/links.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 51
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T4 — Implement effective-time ordering, the visit/new-mark rule and the safe-link check

## Place in the sequence

- **Blocked by:** — · **Blocks:** T6 — Keep search state and record visits, T7 — Run a search and keep its snapshot · **Wave:** 1 (pure domain, no deps).
- **Lane:** own lane. Three small pure files, clock injected.

## Why (user story)

> **As an** owner
> **I want** postings collected since my previous visit to be marked new, with their count shown
> **So that** I don't miss a role a slower source delivered late, below postings I already read
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** each posting to show its title, company, publication time and location restriction, and to name and link every source that lists it
> **So that** I can check where I may work from and apply on the board I prefer
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The three remaining pure rules: where a posting sits, whether it is new, and whether its link may be sent.

## Inlined context

> **Ordering** — Effective time = the posting's publication time, capped at its first-collected time; no publication time → first-collected time, shown as "publication time unknown"; newest first, ties by posting id (AC-03)
>
> **Visits and new marks** — A visit starts when the main screen is opened more than 30 minutes after it was last seen open; every waiting-count poll (only while the tab is visible) refreshes "last seen". A posting is new when first collected after the previous visit's start; nothing is new on the first visit; reopened or updated postings are not new (AC-14)
>
> **ID strategy** — UUIDv7 from `core/id.ts` for snapshot ids; ties in order break on posting id (descending), stable on every load (AC-03)
>
> — `sad.md §8, rows Ordering / Visits and new marks / ID strategy, verbatim` · full text: [sad.md](../sad.md)

> A link is sent only when its protocol is `http:` or `https:` — otherwise the source is named without a link
>
> — `sad.md §8, Untrusted source content, abridged` · full text: [sad.md](../sad.md)

> Time | UTC epoch milliseconds; the clock is injected into search's use cases
>
> — `sad.md §8, Time, abridged`

**Fallback:** [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md). Do not guess.

## Data delta

No DB changes. (Reads, via callers: `collector_postings.published_at`, `.first_found_at`, `.id`; `search_state` visit columns — `data-model.md §Read from the collector`.)

## API contract

Internal — no API surface. (`published_at: null` ⇔ "publication time unknown"; `url: null` when unsafe — shaped in T7.)

## Acceptance criteria

### AC-03 — domain invariant

> **Given** two postings are tied on time, one source states a publication time in the future, and another states none
> **When** the owner's list is ordered
> **Then** postings are ordered newest first by publication time; a publication time later than the moment job-radar first collected the posting counts as that first-collected moment; a posting with no publication time is placed by its first-collected moment and shown as "publication time unknown"; ties keep the same order on every load
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a source's listing carries markup or script in its title or description, or a link that is not an ordinary web address
> **When** the posting is shown, including where matched skills are marked
> **Then** the text is shown as plain text and never acts as markup, and the source is still named but its link is not clickable
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy

> **Given** the owner's previous visit to the main screen started yesterday at 09:00, and since then the collector added postings — including one published two days ago that a slower source delivered this morning
> **When** the owner opens the main screen
> **Then** every posting first collected after yesterday 09:00 is marked new — the late one included, in its publication-time position — and the screen shows how many of the listed postings are new
>
> > A visit starts when the owner opens the main screen after more than 30 minutes without it open; searching, paging and refreshing during a visit do not start a new one. "New" counts only postings first collected after the previous visit started — a reopened or updated posting is not new. On the owner's very first visit there is no previous visit, so nothing is marked new.
>
> — `spec.md §5, AC-14 + note, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `order.ts`: `effectiveTime({publishedAt, firstFoundAt})` (`min`, or `firstFoundAt` when null) + `compareNewestFirst` (effective time desc, then id desc).
- [ ] `visit.ts`: `nextVisit(state, now)` → `{visitStartedAt, visitLastSeenAt, previousVisitStartedAt}` (gap > 30 min or never → new visit, current start becomes previous); `isNew(firstFoundAt, previousVisitStartedAt)` (`false` when previous is null).
- [ ] `links.ts`: `safeUrl(url)` → the URL when `new URL(url).protocol` is `http:`/`https:`, else `null`; never throws.
- [ ] Unit tests beside each file.

## Edge cases

| Case | Behaviour |
|---|---|
| `published_at` > `first_found_at` | effective = `first_found_at` (displayed time too) |
| `published_at` null | effective = `first_found_at`, shown "unknown" |
| Equal effective time | higher id first, same on every call |
| Gap exactly 30 min | same visit (new only when **more than** 30 min) |
| First visit ever (state empty) | new visit, previous = null → nothing new |
| `first_found_at` == previous start | not new (strictly after) |
| `javascript:`, `data:`, malformed URL | `null` |

## Definition of Done

- [ ] unit tests for every Edge-cases row pass, with a fake clock
- [ ] no I/O in the three files
- [ ] lint + vet clean
