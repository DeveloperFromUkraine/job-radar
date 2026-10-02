---
id: T5
title: "Define the adapter contract and normalize listings (plain text, location as stated, category filter)"
layer: "domain"
deps: []
blocks: ["T6", "T7", "T11"]
acs: ["AC-21", "AC-22", "AC-23"]
files_hint: ["apps/server/src/modules/collector/domain/listing.ts", "apps/server/src/modules/collector/domain/adapter.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 54
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T5 — Define the adapter contract and normalize listings (plain text, location as stated, category filter)

## Place in the sequence

- **Blocked by:** nothing — starts in wave 0 · **Blocks:** T6 — Implement the match key and the merge decision, T7 — Implement listing closures per source verdict and the 30% hold-back, T11 — Build the ledgered HTTP client and the Jobicy adapter · **Wave:** 0 (no prerequisites).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** each source's location restriction kept exactly as the source stated it, with "unknown" when it states nothing
> **So that** the later remote filter never mistakes a missing restriction for "work from anywhere"
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to choose, in a settings file on my machine, which sources are enabled and which of their job categories count as tech
> **So that** the collection holds only roles I could want and I can adjust when a board changes its categories
>
> > **Visitor:** no user story — a visitor has no goal this feature serves; the role exists only to be kept out, covered by AC-17 and §6.1.
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Defines what every source adapter returns and the per-listing rules applied before merging.

## Inlined context

> **Chosen:** Option 1. Every adapter returns `{ listings, completeness: complete | capped | partial | failed, closeSignals }`, where `listings` are already normalized (plain-text fields, location restriction as stated or `unknown`, categories); the collector's domain alone turns a verdict into listing closures, and only for `complete` fetches or direct signals. Letting Jobicy confirm closures inside its window keeps merged postings with a Jobicy listing closable — Jobicy is the freshness source, so most merged postings carry one.
>
> — `adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md §Decision outcome, Chosen, verbatim` · full text: [0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md](../adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md)

> **Hard rule:**
>
> | Concept | Convention | Where defined |
> |---|---|---|
> | Untrusted source content | Each adapter validates the response shape against a schema; responses above 10 MB or slower than 30 s are rejected as `failed` (spec §6.1 oversized/malformed); HTML in titles and descriptions is converted to plain text at ingest and stored only as text; the web app renders it as text, never as markup (`dangerouslySetInnerHTML` is not used) | here |
>
> — `sad.md §8, Untrusted source content, verbatim` · full text: [sad.md](../sad.md)

>   - Hostile content inside a listing (markup or script in a title or description): kept as plain text and never executed or rendered as markup when shown later.
>
> — `spec.md §6.1, abuse case: hostile content, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-21 — happy

> **Given** a source states where candidates may work from — as countries, regions, time zones or free text
> **When** its listing is collected
> **Then** the posting keeps that statement exactly as the source gave it, named after the source; when the source later changes the listing, the latest statement replaces the stored one (no history is kept), and earlier merges are not re-decided
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — domain invariant

> **Given** a source states nothing about where candidates may work from
> **When** its listing is collected
> **Then** the posting's location restriction is recorded as unknown, never as "anywhere"
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — happy

> **Given** the owner's tech category list, kept in their settings file, does not include a source's category
> **When** that source offers a listing in it
> **Then** the listing is not collected — a listing in several categories is collected if at least one is on the list; a listing with no category is not collected and is counted in source health; postings already collected under a category the owner later removes stay and age out as usual
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Adapter contract types `{ listings, completeness: complete | capped | partial | failed, closeSignals }` and `NormalizedListing` — `domain/adapter.ts`
- [ ] `toPlainText(html)` — strip tags, decode entities, collapse whitespace; never keep markup — `domain/listing.ts`
- [ ] `locationRestriction(raw)` → the source's statement as given, or `null` (= unknown) when it states nothing — never "anywhere" — `domain/listing.ts`
- [ ] `filterByCategories(listings, ownerCategories)` → kept listings + count with no category; a listing with several categories is kept if one is listed (exact name match) — `domain/listing.ts`
- [ ] Unit tests — `domain/listing.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `<script>alert(1)</script>Senior Dev` as title | Stored as plain text `Senior Dev`, never markup |
| Location field empty / missing | `null` = unknown |
| Location "Worldwide" | Kept as "Worldwide" — stated, not interpreted |
| Listing with no category | Not collected, counted in `no_category` |
| Category removed from the owner's list later | Already collected postings stay (AC-23) |

## Definition of Done

- [ ] unit tests for plain text, location and category filter pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
