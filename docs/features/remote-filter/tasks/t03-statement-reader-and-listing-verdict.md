---
id: T03
title: "Read one location statement and decide one listing's verdict for a country and a date"
layer: "domain"
deps: ["T02"]
blocks: ["T04"]
acs: ["AC-01", "AC-02"]
files_hint: ["apps/server/src/modules/remote-filter/domain/statement.ts", "apps/server/src/modules/remote-filter/domain/statement.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T03 — Read one location statement and decide one listing's verdict for a country and a date

## Place in the sequence

- **Blocked by:** T02 — Build the country vocabulary · **Blocks:** T04 — Combine listing verdicts into one posting verdict · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** postings whose stated location leaves out my country to disappear from my list
> **So that** I stop reading roles I cannot take
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

The heart of the filter: one statement in, one of fits / check (with a reason) / not open out — confident readings only.

## Inlined context

> | Reading a statement | Split on commas, semicolons, "and", "&", "/" and line breaks. Drop flags after reading them as their country, and drop the filler words. A statement with nothing left after that (a bare "Remote") is "not recognised", never "not stated" (AC-01). "Anywhere" and "Anywhere in the World" are Worldwide only when they are the whole statement: beside countries or other parts they are dropped and only the rest is read (AC-10). Match country names and aliases longest first, whole words only. Then regions, zones, exception words and soft words. Any word left over makes the statement "not recognised". "Anywhere" is set aside when another open listing states anything (AC-03). Markup is never interpreted: statements are plain text (search AC-09) |
> | Time | The verdict takes the date from search's injected clock; offsets come from `Intl` for that year's 15 January and 15 July, so tests can run a winter and a summer date (spec §6 Seasonal stability) |
>
> — `sad.md §8, Reading a statement + Time, verbatim` · full text: [sad.md](../sad.md)

> `domain` holds the rules the acceptance criteria state. They are pure and take the date as an input: … the statement reader: parts, fillers, countries longest name first, regions, zones, exceptions, soft wording, cut-short lists; one listing's verdict for a country and a date.
>
> — `sad.md §5, Building block view, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** 0 postings hidden whose statement is unknown, unrecognised, contains an exception, or fits only by working hours.
>
> — `spec.md §6, Never a wrong hide on uncertainty, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule (§6.1 abuse case):** An extremely long or garbled location statement: read as "not recognised" and shown with the check mark — never hidden, never blocks the list.
>
> — `spec.md §6.1, Abuse cases, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (The reason values are the contract's `LocationCheck` enum: `exception`, `hours_only`, `not_recognised`, `not_stated` — `contracts/openapi.yaml, schema LocationCheck, abridged`.)

## Acceptance criteria

### AC-01 — happy

> **Given** the owner's country is Poland, the filter is on, and open postings state "USA", "LATAM", "EMEA", "Europe", "Poland", "🇵🇱 Poland, 🇺🇦 Ukraine", "Worldwide" and "UTC-1 to UTC+3"
> **When** the owner opens the main screen
> **Then** the list shows the EMEA, Europe, Poland, flag-list, Worldwide and UTC-range postings, each with its location as the source stated it, and does not show the USA and LATAM postings
>
> > Fits: the stated location names the country (by name, common short name or flag), names a region that contains it, says Worldwide (also "Global"), or — when it names no country or region — gives time zones that cover one of the country's offsets during the year (Poland: UTC+1 in winter, UTC+2 in summer), so the verdict does not change with the season. A country or region that fits wins over working hours that don't ("Europe, PST hours" fits): the hiring condition is met, the schedule is the owner's call.
> >
> > Not open: every part of the statement is read and none includes the country — named countries or regions that leave it out ("Remote (US only)", "US-based", "Canada, USA"), or time zones alone that cover neither of its offsets ("UTC-8 to UTC-5").
> >
> > Reading: a fixed list of filler words is ignored (remote, only, based, fully, in, the, brackets, dashes — the list is fixed in design); any other unknown word makes the whole statement "not recognised" ("USA, Helsinki"; a bare "Remote", which says nothing about where). Soft wording ("preferred", "ideally", "nice to have", "welcome") is never a reason to hide: such a statement is read as check. A list cut short ("…", "+3 more") is check unless its visible part already names the country. Time zones are read as UTC or GMT offsets and ranges, plus a fixed list of zone names (CET/CEST, EET, WET, GMT, the US ET/CT/MT/PT and their variants — fixed in design); other time wording ("European time zones", "overlap with PST") is not recognised. Country names are matched longest name first ("Papua New Guinea" is not Guinea, "New Mexico" is not Mexico, "Oman" is not found in "Romania"); two-letter codes are not read, except a short fixed list of unambiguous ones (US, USA, UK, UAE and the like — fixed in design), so "CA" or "IN" is not recognised; a name that is both a country and a part of another country (Georgia) is not recognised unless another part of the statement already decides. The region, filler-word, zone-name and short-code lists are covered by the §6 example set.
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — domain invariant

> **Given** the owner's country is Poland and open postings state nothing, "Helsinki", "Worldwide except Poland", and "United States, UTC-10 to UTC+14"
> **When** the owner opens the main screen
> **Then** all four stay in the list, each marked "check location" with the reason — location not stated / location not recognised / mentions an exception / only working hours fit — because a location the filter cannot read with confidence is never hidden
>
> > "Only working hours fit": the statement names countries or regions that leave the country out, but its time zones cover the country. An exception is any "except", "excluding", "not", "outside" wording; such a statement is never read as fits and never hidden. When several reasons apply, the mark shows one, in this order: mentions an exception > only working hours fit > location not recognised > location not stated; every source's statement is shown beside it (search AC-07).
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `statement.ts`: `readStatement(text)` → parts (countries, regions, zones, worldwide, exception/soft/cut-short flags, unrecognised) using T02's tables; length guard → not recognised
- [ ] `listingVerdict(statement | null, country, date)` → `fits` | `check(reason)` | `not_open`, with the reason priority exception > hours_only > not_recognised > not_stated
- [ ] A lone "Anywhere" / "Anywhere in the World" reads as Worldwide; beside other parts it is dropped (AC-10 reading)
- [ ] `statement.test.ts`: every AC-01 / AC-02 statement, "Europe, PST hours" (fits), "UTC-8 to UTC-5" (not open), "USA, Helsinki" and bare "Remote" (not recognised), "Papua New Guinea" / "New Mexico" / "Romania" collisions, "Georgia" alone (not recognised), cut-short lists — each at a January and a July date

## Edge cases

| Case | Behaviour |
|---|---|
| `null` statement | check, `not_stated` |
| Bare "Remote" | check, `not_recognised` (never `not_stated`) |
| "Worldwide except Poland" | check, `exception` — never fits, never hidden |
| "Poland preferred" / "USA preferred" | check (soft wording never hides) |
| "USA, Canada, +3 more" | check; "Poland, Germany, +3 more" fits |
| 10,000-char garbage | check, `not_recognised`; returns promptly |
| `<script>` inside a statement | read as words → not recognised; never interpreted |

## Definition of Done

**Done when:** `statement.test.ts` passes for every AC-01 and AC-02 statement and the edge cases above, each giving the same verdict on 15 January and 15 July.

- [ ] `statement.test.ts` passes
- [ ] the module is pure: no DB, no clock read — the date is a parameter
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
