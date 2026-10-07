---
id: T12
title: "Add search's marked view: a fixed-order marked snapshot with skills, closed and cleared postings"
layer: "app"
deps: ["T11"]
blocks: []
acs: ["AC-05", "AC-06"]
files_hint: ["apps/server/src/modules/search/app/marked.ts", "apps/server/src/modules/search/app/snapshots.ts", "apps/server/src/modules/search/ports/routes.ts", "apps/server/test/search-marked.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Add search's marked view: a fixed-order marked snapshot with skills, closed and cleared postings

## Place in the sequence

- **Blocked by:** T11 — Make search's main list mark-aware: snapshot keeps marked, pages skip them, counts and hints · **Blocks:** — · **Wave:** 5 (after its deps finish).
- **Lane:** shares files with T11 — serialized with them.

## Why (user story)

> **As an** owner
> **I want** to see the postings I marked, including closed ones, and change or clear a mark
> **So that** I can find a role I applied to when a recruiter replies, and fix a decision I regret
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

The "Show marked postings" view the owner uses to find and fix a decision.

## Inlined context

> `marked.ts` NEW marked view: snapshot of marked ids by mark time, skills applied, closed included. A marked-view snapshot holds marked and cleared-closed posting ids ordered by mark time, newest first, with cleared ones by when they were cleared. It is fixed when the view loads (AC-05).
>
> — `sad.md §5, Internal decomposition + Snapshots, abridged` · full text: [sad.md](../sad.md)

> A closed posting has no open listing, so here a skill matches the text of **every** listing, open or closed (api-sync-report F-1). Unlike `runSearch`, this call does **not** save the skills as the last skills (F-7). The order and the pages are fixed in a new marked snapshot (same store, limits and expiry as search ADR-0003).
>
> — `contracts/openapi.yaml, runMarkedView description, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

> Each item's `mark_state` is read fresh, so a posting changed or cleared since loading shows its current state in place. A posting removed by clean-up since loading is left out.
>
> — `contracts/openapi.yaml, getNextMarkedPage description, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

> Marked view: ≤ 1 s p95 to show the first 50 marked postings, with 5,000 marked postings (about 60 days of skips plus every applied posting) and up to 20 skills
>
> — `spec.md §6, Marked view, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`. A module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Reads marks through tracking's `markedOrder` (T09) and postings through the collector's `postingsById` including closed (T05).

## API contract

- `POST /api/v1/search/marked-snapshots` (`runMarkedView`) body `SearchRequest { skills }` → `200 MarkedResult { snapshot_id, skills, marked_count, cleared_count, items: MarkedPosting[≤50], has_next, next_cursor }` · `400 SEARCH_INVALID_SKILLS` · `503`.
- `POST /api/v1/search/marked-snapshots/{snapshot_id}/pages` (`getNextMarkedPage`) body `{ cursor }` → `200 MarkedPage` · `410 SEARCH_SNAPSHOT_EXPIRED`.
- `MarkedPosting { id, title, company, status: open|closed, published_at, first_seen_at, matched_skills, listings, mark_state: MarkState }`.

— `contracts/openapi.yaml, runMarkedView / getNextMarkedPage / MarkedPosting / MarkedResult, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-05 — happy

> **Given** the owner has marked postings, some of which have since closed, and has cleared the marks of some closed postings (AC-07)
> **When** the owner turns on "Show marked postings"
> **Then** the list shows only marked postings, most recently marked first, each with its mark and the date it was set, and with the number of marked postings. Closed postings whose mark the owner cleared and that clean-up has not yet removed are shown too, labelled "Cleared, removed after <date>" with the applied and skipped actions, and counted separately ("and N cleared"). The owner's skills narrow the view as they narrow the main list. A closed posting is labelled "Closed" and names every source, with links only for listings still open. The order and the pages are fixed when the view loads, as for the main list (AC-12): a card whose mark the owner changes stays in place until the view is refreshed, and later pages never repeat or skip a posting. The switch starts off on every visit, and turning it off returns to the unmarked list.
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** a posting is shown in the marked postings
> **When** the owner changes its mark (applied to skipped or back) or clears it
> **Then** a changed mark replaces the old one (a posting has at most one mark) and the date updates. A cleared open posting returns to the main list and its counts in its publication-time position, and it counts as new only by the rule for new postings (first collected after the previous visit started), never because its mark was cleared. A cleared closed posting stays in the marked postings as AC-05 and AC-07 describe.
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/app/marked.ts`: build the marked snapshot from `markedOrder` (T09), filter by skills over every listing, fetch postings incl. closed (T05)
- [ ] `search/app/snapshots.ts`: a second snapshot kind in the same store, limits and expiry
- [ ] `search/ports/routes.ts`: the two routes; do not save skills as last skills
- [ ] `apps/server/test/search-marked.integration.test.ts` incl. the NFR seed (5,000 marks, 20 skills)

## Edge cases

| Case | Behaviour |
|---|---|
| Mark changed after the view loaded | Card keeps its place; next page shows fresh `mark_state` |
| Posting removed by clean-up after load | Left out of later pages |
| Cleared open posting | Not in the view (back in the main list) |
| No marks at all | `marked_count: 0`, `cleared_count: 0`, `items: []` |
| Expired snapshot | 410 `SEARCH_SNAPSHOT_EXPIRED` |

## Definition of Done

**Done when:** search-marked.integration.test.ts passes: runMarkedView returns marked + cleared-closed postings newest first with marked_count/cleared_count, skills narrow over every listing, closed postings name every source with links only for open listings; getNextMarkedPage never repeats or skips and shows fresh mark_state; responses validate against the contract; first 50 ≤1 s p95 with 5,000 marked and 20 skills.

- [ ] `search-marked.integration.test.ts` passes
- [ ] marked-view NFR ≤ 1 s p95 for the first 50
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
