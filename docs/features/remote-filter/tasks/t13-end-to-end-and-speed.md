---
id: T13
title: "Prove \"Anywhere\" end to end from collection to verdict, and search speed with the filter on"
layer: "tests"
deps: ["T05", "T09", "T10"]
blocks: []
acs: ["AC-10", "AC-11"]
files_hint: ["apps/server/test/remote-filter-e2e.integration.test.ts", "apps/server/test/search-nfr.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T13 — Prove "Anywhere" end to end from collection to verdict, and search speed with the filter on

## Place in the sequence

- **Blocked by:** T05 — Keep an explicit "Anywhere" in the collector, T09 — Expose remote-filter's routes, T10 — Make search's main list location-aware · **Blocks:** — · **Wave:** 6 (last server task).
- **Lane:** own lane (`search-nfr` is touched only here).

## Why (user story)

> **As an** owner
> **I want** a posting its board marks as open "Anywhere" to count as open to my country
> **So that** the most open roles are not the ones carrying a "check" mark
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

The cross-module proof: a fake source run through the real collector, then the real routes, shows "Anywhere" kept, read as Worldwide, set aside beside "USA" — and the list stays fast.

## Inlined context

> Postcondition: Anywhere is shown as stated and read by the filter as Worldwide, or set aside when another open listing states anything (Flow 1)
>
> — `sad.md §6, Flow 6, verbatim` · full text: [sad.md](../sad.md)

> QG-3. **When:** the owner searches with the filter on. **Then:** ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings and up to 20 skills (unchanged from search). **How verify:** the search integration test, rerun with the filter on for Poland.
>
> — `sad.md §10, QG-3, abridged` · full text: [sad.md](../sad.md)

> Postings whose listings carry the spec examples ("USA", "EMEA", "🇵🇱 Poland, 🇺🇦 Ukraine", "UTC-1 to UTC+3", `NULL`, "Worldwide except Poland", "Anywhere" beside "USA") are built with the existing `seedOpenPostings` helper and listing overrides. Company `Example Co`, URLs `https://jobs.example.test/<id>`.
>
> — `data-model.md §Test fixtures, verbatim` · full text: [data-model.md](../data-model.md)

Helpers available: `test/helpers/fake-sources.ts` (fake Jobicy / WWR responses), `search-fixtures.ts` (`seedOpenPostings`), `tracking-fixtures.ts` (`seedMarks`), T06's `remote-filter-fixtures.ts`, `contract.ts`.

> **Hard rule:** Search response with the filter on — ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings and up to 20 skills.
>
> — `spec.md §6, NFR row 1, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Exercises `chooseCountry`, `runSearch`, `runMarkedView` through the app as served; responses validated against `contracts/openapi.yaml` (and applied-skipped's for the unchanged marked view).

## Acceptance criteria

### AC-10 — cross-context

> **Given** a source states only "Anywhere" or "Anywhere in the World" for a listing
> **When** the listing is collected
> **Then** the location restriction is kept as the source stated it ("Anywhere" is what the owner sees) and the filter reads it as Worldwide, so the posting fits for any country; for merging it still counts as stating nothing, so it never keeps two listings of the same role apart (collector AC-05); when the same source lists countries beside "Anywhere", the countries are the statement; a listing already held as unknown takes the new reading the next time its source offers it, and that change is not counted as an updated posting or in source health, since the source changed nothing; when countries stand beside "Anywhere", the whole statement is kept and shown as stated, and the filter reads only the countries
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — cross-context

> **Given** the owner marked a posting at Acme applied, and a look-alike Acme posting that states "USA" is open
> **When** the owner opens the main screen with the filter on for Poland, and then the marked view
> **Then** the look-alike posting is hidden like any posting not open to Poland (its earlier-mark hint shows only when it is shown), and the marked view lists every marked posting whatever its location, unchanged by the filter
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `apps/server/test/remote-filter-e2e.integration.test.ts`: fake Jobicy "Anywhere" + WWR "Anywhere in the World" → collect → choose Poland → `runSearch` shows them as fitting with `location_restriction` "Anywhere…"; a merged posting "USA" + "Anywhere" is hidden; a marked "USA" posting appears in the marked view
- [ ] `apps/server/test/search-nfr.integration.test.ts`: add the filter-on-for-Poland run (10,000 postings, 20 skills, ~50 distinct statements) asserting p95 ≤ 1 s

## Edge cases

| Case | Behaviour |
|---|---|
| Second run offers the same "Anywhere" for a held unknown listing | statement updated; not an updated posting; source health unknown count drops |
| Statements all distinct (worst case cache) | still within the NFR — record the measured p95 in the test output |

## Definition of Done

**Done when:** `remote-filter-e2e.integration.test.ts` passes AC-10 and AC-11 through the real collector and routes, and `search-nfr.integration.test.ts` passes with the filter on for Poland at p95 ≤ 1 s.

- [ ] both test files pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
