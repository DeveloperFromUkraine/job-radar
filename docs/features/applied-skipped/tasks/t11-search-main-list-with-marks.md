---
id: T11
title: "Make search's main list mark-aware: snapshot keeps marked, pages skip them, counts and hints"
layer: "app"
deps: ["T08", "T09"]
blocks: ["T12", "T17"]
acs: ["AC-01", "AC-08", "AC-12", "AC-13"]
files_hint: ["apps/server/src/modules/search/app/search.ts", "apps/server/src/modules/search/app/pages.ts", "apps/server/src/modules/search/app/waiting.ts", "apps/server/src/modules/search/app/present.ts", "apps/server/src/modules/search/app/deps.ts", "apps/server/src/modules/search/index.ts", "apps/server/src/modules/search/ports/routes.ts", "apps/server/src/app.ts", "apps/server/test/search-marks.integration.test.ts", "apps/server/test/search-nfr.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Make search's main list mark-aware: snapshot keeps marked, pages skip them, counts and hints

## Place in the sequence

- **Blocked by:** T08 — Implement ProtectedPostings in tracking and wire it into the collector in app.ts, T09 — Implement tracking's read queries for search: marked ids, the marked order, and look-alike hints · **Blocks:** T12 — Add search's marked view: a fixed-order marked snapshot with skills, closed and cleared postings, T17 — Prove marks hold through every collector event and a restart, and that marking stays under 300 ms p95 · **Wave:** 4 (after its deps finish).
- **Lane:** shares files with T08, T10, T12 — serialized with them.

## Why (user story)

> **As an** owner
> **I want** the counts, the next pages and the empty state to account for my marks
> **So that** what the list tells me matches what I see
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Turns the main list into an inbox whose pages, counts and empty state account for marks.

## Inlined context

> **Decision:** A search snapshot keeps every matching open posting, marked ones included. Each page reads the currently marked ids, walks the snapshot from the cursor, and returns the next 50 unmarked postings. A posting cleared since loading is therefore back in its place, one marked since is gone, and nothing is skipped (AC-12). The count of marked matches for the "nothing left to review" state comes from the same pass (AC-13).
>
> — `sad.md §4, choice 2 (ADR-0002), verbatim` · full text: [ADR-0002](../adr/0002-snapshot-every-matching-posting-and-drop-marked-ones-as-each-page-loads.md)

> `search.ts` snapshot keeps marked matches; first page drops marked; total / new / marked-match counts · `pages.ts` next page walks the snapshot past marked ids until 50 unmarked (ADR-0002) · `waiting.ts` counts only unmarked waiting postings
>
> — `sad.md §5, Internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> Flow 5: alt no unmarked match, at least one marked match → empty page with the marked-match count; else no match at all → search's nothing matches or first collection message, unchanged; else unmarked matches → look-alike hints for the first 50 → first 50 with hints, unmarked counts, cursor.
>
> — `sad.md §6, Flow 5, abridged` · full text: [sad.md](../sad.md)

> A 503 also covers marks that cannot be read: a list built without them could show decided postings (api-sync-report F-4).
>
> — `contracts/openapi.yaml, runSearch description, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

> When most matching postings are marked, a page walks far into the snapshot to find 50 unmarked ones (ADR-0002) — Bounded by snapshot size; QG-3's search test seeds 5,000 marked of 10,000 open; `durationMs` stays in search's log line. Wave 4: Land this feature's `search/app/` change in one PR before steps 4/5 touch paging.
>
> — `sad.md §11, risks 3 + 5, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`. A module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Snapshots stay in memory (search ADR-0003); marked ids are read through tracking's `app` export (T09).

## API contract

- `runSearch` → `SearchResult { snapshot_id, skills, total, new_count, marked_count, collection_empty, items: Posting[≤50], has_next, next_cursor }`; `total`/`new_count` unmarked only; `marked_count` = matching open postings that are marked; nothing-left = `total: 0` + `marked_count > 0`.
- `getNextPage` → `PostingPage { items, has_next, next_cursor }`; `410 SEARCH_SNAPSHOT_EXPIRED`.
- `getWaitingCount` → `{ waiting_count }` unmarked only.
- `Posting.look_alike: { mark, marked_at, company } | null`.
- `503 SEARCH_COLLECTION_UNAVAILABLE` also when marks cannot be read.

— `contracts/openapi.yaml, runSearch / getNextPage / getWaitingCount / Posting / SearchResult, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** an open posting is in the owner's list
> **When** the owner marks it applied
> **Then** it leaves the list at once and the number of postings shown drops by one, a notice says "Marked applied" with an Undo action, and the posting does not appear in the owner's list again (on later pages, on the next search or visit, or after job-radar restarts) unless the owner clears or undoes the mark
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — cross-context

> **Given** the owner has marked a posting applied or skipped
> **When** the collector merges another source's listing into it, closes it, reopens it, or updates its text, or job-radar restarts
> **Then** the posting keeps its mark and its first-collected time, never re-enters the owner's list, and is not counted as new
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** the owner has 50 postings on screen and, since the list was loaded, has marked some of them, or marks were set or cleared in another window
> **When** the owner asks for more, or a waiting count is shown
> **Then** marks are checked as each page loads: a later page leaves out postings marked since the list was loaded and includes postings whose mark was cleared since, in their publication-time position, and no unmarked posting that belonged after the last one shown is skipped. Cards marked in another window stay on screen, and this window's counts do not change, until the owner refreshes or searches (as search AC-16 does for a posting that closes while on screen). The count of postings and the count of new postings drop as the owner marks postings in this window, and the number of new postings waiting counts only unmarked ones.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — error

> **Given** no unmarked open posting matches the owner's skills (or no unmarked open posting exists, with no skills), and at least one matching open posting is marked
> **When** the owner searches or opens the main screen
> **Then** the owner sees that nothing is left to review, with how many matching open postings they have marked and one action to show the marked postings, instead of the "nothing matches" or "first collection has not brought postings yet" message. When no open posting matches at all, marked or not, search AC-11's messages apply unchanged.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/app/deps.ts` + `search/index.ts` + `app.ts`: inject tracking's queries (T09) into search
- [ ] `search.ts`: snapshot keeps marked matches; first page walks past marked ids; compute `total`, `new_count`, `marked_count`
- [ ] `pages.ts`: walk from the cursor past marked ids until 50 unmarked; cursor = position after the last id read
- [ ] `waiting.ts`: count unmarked only; `present.ts`: add `look_alike` from `hintsFor`
- [ ] Map a marks read failure to 503 `SEARCH_COLLECTION_UNAVAILABLE`
- [ ] `apps/server/test/search-marks.integration.test.ts`; extend `search-nfr.integration.test.ts` with 5,000 seeded marks (`seedMarks`)

## Edge cases

| Case | Behaviour |
|---|---|
| Every match marked | `total: 0`, `marked_count > 0`, `items: []` (AC-13) |
| No match at all | `marked_count: 0`; search AC-11 messages unchanged |
| Posting cleared in another window after load | Appears on the next page in its publication-time position |
| Posting marked in another window after load | Left out of later pages; pages already sent are not touched |
| Cleared posting | `is_new` only by the visit rule, never because it was cleared (AC-06) |
| Marks cannot be read | 503, never a list built without marks |

## Definition of Done

**Done when:** search-marks.integration.test.ts passes (marked left out of first and next pages, cleared-since returns in place, nothing skipped, total/new_count/marked_count right, nothing-left state, waiting counts unmarked only, look_alike set); runSearch/getNextPage/getWaitingCount responses validate against the applied-skipped contract; search NFR test holds ≤1 s p95 with 10,000 open and 5,000 marked.

- [ ] `search-marks.integration.test.ts` passes
- [ ] search NFR ≤ 1 s p95 first and next page with 5,000 marked
- [ ] existing search tests updated to the new contract and passing
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
