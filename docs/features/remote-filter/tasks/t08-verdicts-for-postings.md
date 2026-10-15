---
id: T08
title: "Answer search's verdict question: verdicts for a set of postings and a country, from open listings of enabled sources, one parse per distinct statement"
layer: "app"
deps: ["T04", "T05"]
blocks: ["T10"]
acs: ["AC-03"]
files_hint: ["apps/server/src/modules/remote-filter/app/verdicts.ts", "apps/server/test/remote-filter-verdicts.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T08 — Answer search's verdict question: verdicts for a set of postings and a country, from open listings of enabled sources, one parse per distinct statement

## Place in the sequence

- **Blocked by:** T04 — Combine listing verdicts into one posting verdict, T05 — Keep an explicit "Anywhere" in the collector and export it · **Blocks:** T10 — Make search's main list location-aware · **Wave:** 4.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** postings whose location is unknown or unclear to stay in my list with a mark that says why
> **So that** a role I could take is never hidden just because its board phrased the location badly
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

The `app/` export search calls: posting in, verdict out — counting only listings the owner can actually click through to.

## Inlined context

> Search asks for the verdict of every matching posting, marked or not. … Each distinct statement is read once per search, and a rule fix takes effect on the next search with no backfill.
>
> — `sad.md §4, strategic choice 2, abridged` · full text: [sad.md](../sad.md)

> A per-search cache keyed by statement text makes that one parse per distinct statement, about 50 today.
>
> — `adr/0002, Consequences/Negative, verbatim` · full text: [ADR-0002](../adr/0002-decide-location-verdicts-on-read-when-search-builds-its-snapshot.md)

> `app/` — `verdicts.ts (verdicts for postings and a country, per-call cache)`
>
> — `sad.md §5, Internal decomposition, verbatim` · full text: [sad.md](../sad.md)

Input shape (collector export, today): `OpenPosting { id, status, title, company, publishedAt, firstFoundAt, listings: OpenListing[] }`, `OpenListing { sourceId, status: "open"|"closed", url, locationRestriction: string|null }` — `apps/server/src/modules/collector/infra/repo/open-postings.ts:9-26`. From T05: `isStatedAnywhere`, `enabledSourceIds(db)` via `collector/app/location.ts`.

> **Hard rule:** a module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [adr/0002](../adr/0002-decide-location-verdicts-on-read-when-search-builds-its-snapshot.md)) and follow it. Do not guess.

## Data delta

No DB changes. (Reads `collector_listings.location_restriction` / `.status` only through the collector rows search already loaded — no extra query; data-model §Indexes.)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-03 — domain invariant

> **Given** a posting merged from two boards, one listing stating "USA" and the other stating nothing; another whose listings state "USA" and "Anywhere"; and a third whose listings came to state "EMEA" and "USA" after they were merged (a listing changed its statement later — collector AC-21, earlier merges are not re-decided)
> **When** the owner, in Poland, opens the main screen
> **Then** the first posting is shown marked "check location", the second is hidden ("Anywhere" is set aside when another listing of the same posting states something specific), and the third is shown as fitting; a posting is hidden only when every one of its open listings states a readable location that leaves the country out
>
> — `spec.md §5, AC-03, verbatim` · the "Combining listings" note is inlined in [T04](./t04-posting-verdict-and-example-set.md#acceptance-criteria)

## Checklist

- [ ] `remote-filter/app/verdicts.ts`: `verdictsFor(deps, postings, countryCode, date)` → `Map<postingId, Verdict>`; keep listings with `status === "open"` and `sourceId ∈ enabledSourceIds()`; inject `isStatedAnywhere` into T04's `postingVerdict`; cache listing reads by statement text for the call
- [ ] `apps/server/test/remote-filter-verdicts.integration.test.ts`: the three AC-03 postings; a "USA" posting whose only fitting listing is closed or from a disabled source → not open

## Edge cases

| Case | Behaviour |
|---|---|
| Fitting listing closed at its source | ignored → verdict from the rest |
| Fitting listing from a disabled source | ignored (sad §11 accepted risk) |
| Same statement on 1,000 listings | parsed once per call |

## Definition of Done

**Done when:** `remote-filter-verdicts.integration.test.ts` passes for the three AC-03 postings and the closed / disabled-source listings.

- [ ] `remote-filter-verdicts.integration.test.ts` passes
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
