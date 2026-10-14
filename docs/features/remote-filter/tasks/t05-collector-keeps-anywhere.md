---
id: T05
title: "Keep an explicit \"Anywhere\" as stated in the collector, treat it as nothing stated for merge and change checks, and export it with the enabled sources"
layer: "domain"
deps: []
blocks: ["T08", "T13"]
acs: ["AC-10"]
files_hint: ["apps/server/src/modules/collector/domain/listing.ts", "apps/server/src/modules/collector/domain/listing.test.ts", "apps/server/src/modules/collector/domain/merge.ts", "apps/server/src/modules/collector/domain/merge.test.ts", "apps/server/src/modules/collector/infra/repo/postings.ts", "apps/server/src/modules/collector/infra/sources/jobicy.ts", "apps/server/src/modules/collector/infra/sources/weworkremotely.ts", "apps/server/src/modules/collector/app/location.ts", "apps/server/test/collector-ingest.integration.test.ts", "apps/server/test/collector-adapters.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T05 — Keep an explicit "Anywhere" as stated in the collector, treat it as nothing stated for merge and change checks, and export it with the enabled sources

## Place in the sequence

- **Blocked by:** — · **Blocks:** T08 — Answer search's verdict question for a set of postings, T13 — Prove the cross-context ACs end to end and search speed with the filter on · **Wave:** 1 (collector only, starts at once).
- **Lane:** own lane. Roadmap step 10 (LinkedIn adapter) touches the same collector code and lands after this feature (sad §11).

## Why (user story)

> **As an** owner
> **I want** a posting its board marks as open "Anywhere" to count as open to my country
> **So that** the most open roles are not the ones carrying a "check" mark
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

The only collector change: stop turning an explicit "Anywhere" into unknown, without letting it keep two listings of one role apart.

## Inlined context

> "Anywhere" (spec AC-10) is one predicate, `isStatedAnywhere()`, in `collector/domain/listing.ts`: an exact "Anywhere" or "Anywhere in the World", any case, after trimming. The Jobicy and We Work Remotely readers keep it as stated instead of turning it into `null`. The merge rule's location-conflict check and the listing's change check treat it as `null`, so a listing going from `null` to "Anywhere" is not an updated posting. Source health's unknown-location count counts only `null`. remote-filter reads the predicate through a collector `app/` re-export.
> An open listing for the verdict is one with status open from an enabled source (spec AC-03). remote-filter reads the enabled-source set through a new read-only collector export.
>
> — `sad.md §4, Inline decisions, verbatim` · full text: [sad.md](../sad.md)

> ```
> ├── modules/collector/
> │   ├── domain/listing.ts          + isStatedAnywhere(); toLocationRestriction unchanged
> │   ├── domain/merge.ts            conflicts(): an "Anywhere" statement counts as nothing stated
> │   ├── infra/repo/postings.ts     null → "Anywhere" is not a change (no updated posting)
> │   ├── infra/sources/jobicy.ts    keeps "Anywhere" as stated
> │   ├── infra/sources/weworkremotely.ts  keeps "Anywhere in the World" as stated
> │   ├── app/ingest.ts              unknownLocationNew counts only null (unchanged code path, now true by data)
> │   └── app/location.ts            NEW read-only: re-export isStatedAnywhere, enabledSourceIds()
> ```
>
> — `sad.md §5, Internal decomposition (collector), verbatim` · full text: [sad.md](../sad.md)

> `alt` listing already held, its stored statement unknown → replaces unknown with the Anywhere statement — persists the listing's location restriction, not counted as an updated posting, not counted in source health. `else` statement unchanged or changed otherwise → updates as before, a real change counts as an updated posting. `else` new listing → merge candidates in the 7-day window; Anywhere counts as nothing stated, so it never conflicts with a candidate's statement.
>
> — `sad.md §6, Flow 6, abridged` · full text: [sad.md](../sad.md)

Code today (2026-10-14): `jobicy.ts:48` drops "Anywhere" ("that is nothing stated (AC-22)"); `weworkremotely.ts:10` has `const NOTHING_STATED = "Anywhere in the World"`; `merge.ts:172-174` compares `locationRestriction !== null`; `postings.ts:103` compares `before.locationRestriction !== listing.locationRestriction`. Enabled sources: `sourceState(settings, s) === "enabled"` (as in `app/finalize.ts:39`).

> **Hard rule:** Listings and postings, merging and source readers belong to the collector (collector ADR-0004, ADR-0005). … a module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · collector [spec](../../remote-boards-collector/spec.md) AC-04/05/21/22) and follow it. Do not guess.

## Data delta

No DB changes. The existing `collector_listings.location_restriction` (text, nullable) now also holds an explicit "Anywhere" statement instead of `NULL`; no backfill — held `NULL` listings take the new reading the next time their source offers them.

— `data-model.md §Scope, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`Listing.location_restriction` "exactly as the source stated it, an explicit "Anywhere" included (AC-10)" — `contracts/openapi.yaml, schema Listing, verbatim`.)

## Acceptance criteria

### AC-10 — cross-context

> **Given** a source states only "Anywhere" or "Anywhere in the World" for a listing
> **When** the listing is collected
> **Then** the location restriction is kept as the source stated it ("Anywhere" is what the owner sees) and the filter reads it as Worldwide, so the posting fits for any country; for merging it still counts as stating nothing, so it never keeps two listings of the same role apart (collector AC-05); when the same source lists countries beside "Anywhere", the countries are the statement; a listing already held as unknown takes the new reading the next time its source offers it, and that change is not counted as an updated posting or in source health, since the source changed nothing; when countries stand beside "Anywhere", the whole statement is kept and shown as stated, and the filter reads only the countries
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `collector/domain/listing.ts`: `isStatedAnywhere(text)` — exact "Anywhere" / "Anywhere in the World", any case, trimmed; unit tests in `listing.test.ts`
- [ ] `infra/sources/jobicy.ts`, `infra/sources/weworkremotely.ts`: keep the statement as given (WWR: a country list beside "Anywhere in the World" is kept whole); update the AC-22 comments to point at remote-filter AC-10
- [ ] `domain/merge.ts` conflict check: "Anywhere" counts as `null`; `merge.test.ts` case
- [ ] `infra/repo/postings.ts` change check: `null` ↔ "Anywhere" is not a change (no updated posting, no source-health count)
- [ ] `app/location.ts`: re-export `isStatedAnywhere`, add `enabledSourceIds(db)` read-only
- [ ] Integration: `collector-adapters` (readers keep it) and `collector-ingest` (unknown → Anywhere not counted as updated; merge not blocked)

## Edge cases

| Case | Behaviour |
|---|---|
| "  anywhere " | `isStatedAnywhere` true |
| "Anywhere in Europe" | not the predicate — kept, read by the filter as words |
| "USA, Anywhere in the World" (WWR) | kept whole; filter reads only the countries |
| Held listing `NULL` → "Anywhere" | statement updated; not an updated posting; not in source health |
| Held "Anywhere" → "USA" | a real change, counted as before |
| New "Anywhere" listing vs candidate stating "USA" | no conflict — may merge (collector AC-05) |

## Definition of Done

**Done when:** `listing.test.ts` and `merge.test.ts` cover the predicate and the merge rule, and `collector-ingest` / `collector-adapters` integration tests show "Anywhere" kept as stated, never blocking a merge, and `null` → "Anywhere" not counted as an updated posting.

- [ ] those four test files pass, and the existing collector suite stays green
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
