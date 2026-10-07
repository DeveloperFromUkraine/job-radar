---
id: T09
title: "Implement tracking's read queries for search: marked ids, the marked order, and look-alike hints"
layer: "app"
deps: ["T03", "T05", "T06"]
blocks: ["T11"]
acs: ["AC-05", "AC-10", "AC-11"]
files_hint: ["apps/server/src/modules/tracking/app/queries.ts", "apps/server/test/tracking-queries.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T09 — Implement tracking's read queries for search: marked ids, the marked order, and look-alike hints

## Place in the sequence

- **Blocked by:** T03 — Write the look-alike key and winning-mark rule, on the collector's exported merge normalization, T05 — Add the collector's read-only exports: postings by id including closed, and the retention outlook, T06 — Write the tracking repo: guarded mark writes, undo, and the mark reads every flow needs · **Blocks:** T11 — Make search's main list mark-aware: snapshot keeps marked, pages skip them, counts and hints · **Wave:** 3 (after its deps finish).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to see the postings I marked, including closed ones, and change or clear a mark
> **So that** I can find a role I applied to when a recruiter replies, and fix a decision I regret
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** a posting that looks like one I already marked to say so
> **So that** I don't apply twice to the same role
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

The answers search asks tracking for on every page and on the marked view.

## Inlined context

> `app` … answers search's "which of these are marked" and "hints for this page" questions — `queries.ts` (marked ids, marked order, hints)
>
> — `sad.md §5, Building block view, abridged` · full text: [sad.md](../sad.md)

> Flow 3: Search asks Tracking for marked and cleared-closed postings in mark order → reads marks newest first, cleared ones by when they were cleared → Tracking asks Collector for the retention outlook → ordered ids with mark, date, removal date and at-risk flag.
> Flow 2: Search asks Tracking for look-alike hints for these postings → Tracking reads the match keys of marked postings from the Collector → hint per posting with its mark and date, applied winning.
>
> — `sad.md §6, Flows 2–3, abridged` · full text: [sad.md](../sad.md)

> Look-alike work per page grows with the number of marks (ADR-0004) — if a page passes 1 s p95, keep the key map for the snapshot's lifetime
>
> — `sad.md §11, risk 4, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`. A module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `posting_id` | text | PK, FK → `collector_postings.id` ON DELETE CASCADE | read-only |
| `mark` | text | `applied` \| `skipped`; `NULL` = cleared (row kept) | read-only |
| `marked_at` | integer | NOT NULL; when the current state was set | read-only |
| `previous_mark` | text | `NULL` with `previous_marked_at` `NULL` = never marked (undo deletes the row) | read-only |
| `previous_marked_at` | integer | the previous state's original date, restored by undo | read-only |
| `applied_lost_at` | integer | starts the grace day; `NULL` when marked applied again | read-only |
| `previous_applied_lost_at` | integer | restored by undo | read-only |
| `change_id` | text | NOT NULL, UUIDv7, replaced on every change, undo included | read-only |

— `data-model.md §Entities, tracking_marks, abridged` · full text: [data-model.md](../data-model.md)

Plus collector `status`, `company`, `title` via `collector/app` exports (T03 `match-keys.ts`, T05 `postingsById`).

## API contract

Internal — no API surface. Feeds `LookAlike { mark, marked_at, company }` and `MarkState` in search's responses (T11, T12).

## Acceptance criteria

### AC-05 — happy

> **Given** the owner has marked postings, some of which have since closed, and has cleared the marks of some closed postings (AC-07)
> **When** the owner turns on "Show marked postings"
> **Then** the list shows only marked postings, most recently marked first, each with its mark and the date it was set, and with the number of marked postings. Closed postings whose mark the owner cleared and that clean-up has not yet removed are shown too, labelled "Cleared, removed after <date>" with the applied and skipped actions, and counted separately ("and N cleared"). The owner's skills narrow the view as they narrow the main list. A closed posting is labelled "Closed" and names every source, with links only for listings still open. The order and the pages are fixed when the view loads, as for the main list (AC-12): a card whose mark the owner changes stays in place until the view is refreshed, and later pages never repeat or skip a posting. The switch starts off on every visit, and turning it off returns to the unmarked list.
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — happy

> **Given** the owner marked a posting at "Acme Inc" titled "Sr. Backend Engineer (Go) – Remote" applied on 3 October, and 8 days after its latest publication time the collector adds a separate open posting from "ACME" titled "Senior Backend Engineer"
> **When** the new posting is shown in the owner's list
> **Then** it carries the hint "You applied to a similar posting at Acme on 3 Oct", and the hint names the earlier mark (applied or skipped) and the date it was set. Two postings are similar when their company and title match the way the collector matches them when merging (collector AC-04 note: letter case, punctuation, generic "remote" wording and legal suffixes ignored) and, beyond that, any bracketed part of the title other than a region name is ignored and "Sr" is read as "Senior" and "Jr" as "Junior". Publication times and location restrictions are not compared. When several marked postings match, the hint names an applied one if there is one, otherwise the most recently set skipped mark. Any marked posting job-radar still holds can be the match, closed ones included; a posting whose mark was cleared is unmarked and gives no hint.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — domain invariant

> **Given** a look-alike posting carries a hint about a marked one
> **When** the owner's list is built
> **Then** the look-alike is never hidden and never inherits the mark; it stays in the list and counts until the owner marks it; and a posting from the same company with a different title carries no hint
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tracking/app/queries.ts`: `markedIds(): Set<string>`
- [ ] `markedOrder()`: marked rows + cleared rows whose posting is closed, `marked_at` desc then id, each with `MarkState` (T07's computation reused, not copied)
- [ ] `hintsFor(postings)`: build key → winning mark over current marked rows (closed included, cleared excluded) with T03, look each unmarked posting up
- [ ] `apps/server/test/tracking-queries.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Cleared open posting | Not in markedOrder (it is back in the main list) |
| Cleared closed posting | In markedOrder with `removed_after` |
| Marked posting is itself on the page | Never hinted (search leaves it out anyway) |
| Posting matches its own merged listing | Merged postings are one posting; no hint |

## Definition of Done

**Done when:** tracking-queries.integration.test.ts passes: markedIds reflects current marks; markedOrder returns marked + cleared-closed rows newest first with at_risk/removed_after; hintsFor returns the AC-10 hint for the ACME posting, none for a different title, none for a cleared match.

- [ ] `tracking-queries.integration.test.ts` passes, including the exact AC-10 hint values
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
