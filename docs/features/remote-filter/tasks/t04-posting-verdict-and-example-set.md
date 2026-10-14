---
id: T04
title: "Combine listing verdicts into one posting verdict and pin the fixed example set at a winter and a summer date"
layer: "domain"
deps: ["T03"]
blocks: ["T08"]
acs: ["AC-01", "AC-02", "AC-03"]
files_hint: ["apps/server/src/modules/remote-filter/domain/verdict.ts", "apps/server/src/modules/remote-filter/domain/verdict.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T04 — Combine listing verdicts into one posting verdict and pin the fixed example set at a winter and a summer date

## Place in the sequence

- **Blocked by:** T03 — Read one location statement and decide one listing's verdict · **Blocks:** T08 — Answer search's verdict question for a set of postings · **Wave:** 3.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** postings whose location is unknown or unclear to stay in my list with a mark that says why
> **So that** a role I could take is never hidden just because its board phrased the location badly
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

A merged posting is hidden only when every open listing confidently leaves the country out; this task also owns the spec §6 example-set and property tests that guard the whole verdict.

## Inlined context

> one posting's verdict from its open listings (best wins, "Anywhere" set aside), with the single reason shown by priority (AC-01 – AC-03).
>
> — `sad.md §5, Building block view (domain), verbatim` · full text: [sad.md](../sad.md)

> | Verdict correctness | 100% of the fixed examples give the expected verdict: every distinct location restriction in the owner's collection on 2026-10-14, each judged for Poland, plus the whole-name, exception, mixed and merged examples of AC-01–AC-03 | unit test over the example list |
> | Never a wrong hide on uncertainty | 0 postings hidden whose statement is unknown, unrecognised, contains an exception, or fits only by working hours | property test over generated statements with unfamiliar words, exceptions and empty values |
> | Seasonal stability | the same verdict for every example on a winter date and a summer date | unit test running the example list at two dates |
>
> — `spec.md §6, NFR rows 2–4, verbatim` · full text: [spec.md](../spec.md)

> A unit test over the example list in `remote-filter/domain`, run at two dates. Beyond the spec's examples, the list includes "USA, Anywhere" (not open: the countries are the statement, AC-10) and a bare "Remote" (check, not recognised, AC-01). A property test over generated statements asserting no "not open" for those classes.
>
> — `sad.md §10, QG-1 How verify, abridged` · full text: [sad.md](../sad.md)

> The fixed verdict example list (every distinct statement of 2026-10-14 plus AC-01 – AC-03) is a **unit-test table** in `remote-filter/domain/verdict.test.ts`, not DB data.
>
> — `data-model.md §Test fixtures, verbatim` · full text: [data-model.md](../data-model.md)

> **Hard rule:** the domain is pure; a module reaches another only through that module's `app/` exports (project ADR-0002). The "Anywhere" predicate lives in the collector (`isStatedAnywhere()`, T05), so `verdict.ts` takes it as a parameter — `app/verdicts.ts` (T08) injects the collector's export.
>
> — `sad.md §2 Technical + §4 inline decisions, abridged` · full text: [sad.md](../sad.md)

The distinct statements of 2026-10-14 come from the owner's local DB: `SELECT DISTINCT location_restriction FROM collector_listings` (about 50, ADR-0002 context). Write each with its expected verdict for PL; if a verdict is not obvious from AC-01's rules, ask the owner rather than guess.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-03 — domain invariant

> **Given** a posting merged from two boards, one listing stating "USA" and the other stating nothing; another whose listings state "USA" and "Anywhere"; and a third whose listings came to state "EMEA" and "USA" after they were merged (a listing changed its statement later — collector AC-21, earlier merges are not re-decided)
> **When** the owner, in Poland, opens the main screen
> **Then** the first posting is shown marked "check location", the second is hidden ("Anywhere" is set aside when another listing of the same posting states something specific), and the third is shown as fitting; a posting is hidden only when every one of its open listings states a readable location that leaves the country out
>
> > Combining listings: the posting takes the best verdict among its open listings — fits over check over not open — so "EMEA" beside "Worldwide except Poland" fits. An open listing is one its source still offers, from an enabled source — the listings the owner can click through to (search AC-08); a listing closed at its own source, or from a disabled source, does not count. "Anywhere" is set aside whenever another open listing of the posting states anything at all (anything other than nothing or another "Anywhere"), and the verdict comes from the rest: "Anywhere" beside "Helsinki" or beside "Worldwide except Poland" is check.
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-01, AC-02

The Given-When-Then and notes of AC-01 and AC-02 are inlined verbatim in [T03](./t03-statement-reader-and-listing-verdict.md#acceptance-criteria) (`spec.md §5, AC-01 / AC-02, verbatim`); here they are re-asserted end to end as rows of the example set, with AC-02's reason priority applied across listings: mentions an exception > only working hours fit > location not recognised > location not stated.

## Checklist

- [ ] `verdict.ts`: `postingVerdict(openListingStatements, country, date, isStatedAnywhere)` — set "Anywhere" aside when another listing states anything; best of fits > check > not open; one reason by priority among the check listings
- [ ] `verdict.test.ts`: the fixed example table (every distinct 2026-10-14 statement + AC-01 – AC-03 + "USA, Anywhere" + bare "Remote") run at 15 Jan and 15 Jul
- [ ] Property test: generated statements with unfamiliar words, exceptions and empty values never yield `not_open`

## Edge cases

| Case | Behaviour |
|---|---|
| "USA" + nothing | check, `not_stated` |
| "USA" + "Anywhere" | not open ("Anywhere" set aside) |
| "Anywhere" + "Anywhere" | fits (Worldwide) |
| "Anywhere" + "Helsinki" | check, `not_recognised` |
| "EMEA" + "Worldwide except Poland" | fits (best wins) |
| No open listing left | never reached — search only asks for open postings; return check `not_stated` defensively, never not open |

## Definition of Done

**Done when:** `verdict.test.ts` passes: 100% of the fixed examples give their expected verdict on both dates, and the property test finds no `not_open` for unknown, unrecognised, exception or hours-only statements.

- [ ] `verdict.test.ts` passes (example table + property test)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
