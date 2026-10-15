---
id: T02
title: "Build the country vocabulary from Intl plus the hand-kept alias, region, zone, filler and short-code tables"
layer: "domain"
deps: []
blocks: ["T03", "T07"]
acs: ["AC-01", "AC-05"]
files_hint: ["apps/server/src/modules/remote-filter/domain/vocabulary.ts", "apps/server/src/modules/remote-filter/domain/vocabulary.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T02 — Build the country vocabulary from Intl plus the hand-kept alias, region, zone, filler and short-code tables

## Place in the sequence

- **Blocked by:** — · **Blocks:** T03 — Read one location statement and decide one listing's verdict, T07 — Implement the settings use cases, country lookup and active filter · **Wave:** 1 (pure domain, no deps).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to choose my country once and have job-radar remember it
> **So that** the filter works every time I open the list
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The one list of countries the chooser offers and the filter reads, with each country's names, flag and winter/summer offsets, plus the fixed word tables the statement reader needs.

## Inlined context

> **Chosen:** Option 1 [`Intl` plus small hand-kept tables]. A fixed list of ISO 3166-1 alpha-2 codes, territories included and with XK for Kosovo. Each code's English name comes from `Intl.DisplayNames`, its flag is derived from the code, its time zones come from `Intl.Locale` region info, and each zone's offset on a date comes from `Intl.DateTimeFormat`. A few tables are kept by hand in `remote-filter/domain`: aliases, region membership, zone names, filler words and short codes.
>
> **Answer to spec §8 Q3:**
> - The country list is every code in the fixed list that `Intl.DisplayNames` names in English. A territory is a country of its own: Puerto Rico, Hong Kong and Kosovo can be chosen, and they match only their own names or a region that lists them. "USA" does not include Puerto Rico.
> - Each country accepts its `Intl` English name, the aliases in the alias table, and its flag.
> - The chooser and the filter use this one list (spec §8 Q3 default kept).
>
> — `adr/0003, Decision outcome, abridged` · full text: [ADR-0003](../adr/0003-build-the-country-vocabulary-from-intl-plus-small-hand-kept-tables.md)

> `Intl` output can change with a Node upgrade: a renamed country, or the region time-zone accessor, which is the `timeZones` getter in Node 22 and the `getTimeZones()` method in newer V8. The code reads both, and a unit test pins PL, US, GB and NZ.
>
> — `adr/0003, Consequences/Negative, verbatim` · full text: [ADR-0003](../adr/0003-build-the-country-vocabulary-from-intl-plus-small-hand-kept-tables.md)

> | Filler words | `remote`, `only`, `based`, `fully`, `in`, `the`, `100%`, `-based` suffixes, brackets, dashes, slashes, `&`, `and`, `or`. Everything else unknown makes the statement not recognised |
> | Soft and exception wording | Soft (read as check, never hide): `preferred`, `ideally`, `nice to have`, `welcome`, `plus`. Exception (check, never fits, never hidden): `except`, `excluding`, `not`, `outside`. A cut-short list (`…`, `...`, `+N more`) is check unless its visible part names the country |
> | Zones | `UTC±N` and `GMT±N` with optional `:MM` or a fractional `.5`/`.75`, ranges (`UTC-1 to UTC+3`, `UTC-1 – UTC+3`); `CET`/`CEST`, `EET`/`EEST`, `WET`/`WEST`, `GMT`, `UTC`; US `ET`/`EST`/`EDT`, `CT`/`CST`/`CDT`, `MT`/`MST`/`MDT`, `PT`/`PST`/`PDT`. A zone fits when it covers one of the country's offsets on 15 January or 15 July of the year of the date asked. Other time wording ("European time zones", "USA timezones", "overlap with PST") is not recognised |
> | Short codes | `US`, `USA`, `U.S.`, `U.S.A.`, `UK`, `UAE` as countries; `EU` as a region. No other two-letter code is read ("CA", "IN" are not recognised) |
> | Regions | Worldwide: `Worldwide`, `Global`, and `Anywhere` / `Anywhere in the World` when alone (all countries). `Europe` (EU, EEA, UK, Switzerland, Western Balkans, Ukraine, Moldova, Belarus, microstates; not Russia or Turkey: hand list). `EU` (the 27 members). `EMEA` (Europe + Middle East + Africa, Turkey and Russia included). `LATAM` / `Latin America` (Mexico, Central and South America, Spanish- and Portuguese-speaking Caribbean). `Americas` (North, Central and South America, Caribbean). `North America` / `Northern America` (US, Canada, Mexico; Greenland, Bermuda). `APAC` / `Asia-Pacific` (East, South-East and South Asia, Oceania). Exact member codes live in the vocabulary file and are covered by the example-set test |
> | Aliases | Beyond the `Intl` English name: `United States of America`, `United Kingdom of Great Britain and Northern Ireland`, `Great Britain`, `Czech Republic`, `Hong Kong`, `Moldova (Republic of)`, `Türkiye`, `South Korea`, `Russia`, `Vietnam`, `Macau`, `Ivory Coast`, plus each WWR ISO-official name met in the example set. A name that is both a country and part of another (`Georgia`) is not recognised unless another part decides |
>
> — `sad.md §8, Crosscutting concepts (vocabulary rows), abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Region lists err toward inclusion. Every hide needs every open listing readable and leaving the country out (AC-03).
>
> — `sad.md §11, wrong region membership risk, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [adr/0003](../adr/0003-build-the-country-vocabulary-from-intl-plus-small-hand-kept-tables.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (Feeds `Country { code, name, flag }` in `RemoteFilterSettings.countries` via T07/T09; `name` is the `Intl` English name or the list's preferred alias where `Intl`'s is unusual, e.g. "Hong Kong" — `contracts/openapi.yaml, schema Country, abridged`.)

## Acceptance criteria

### AC-01 — happy

> **Given** the owner's country is Poland, the filter is on, and open postings state "USA", "LATAM", "EMEA", "Europe", "Poland", "🇵🇱 Poland, 🇺🇦 Ukraine", "Worldwide" and "UTC-1 to UTC+3"
> **When** the owner opens the main screen
> **Then** the list shows the EMEA, Europe, Poland, flag-list, Worldwide and UTC-range postings, each with its location as the source stated it, and does not show the USA and LATAM postings
>
> — `spec.md §5, AC-01, verbatim` · full text (with the Fits / Not open / Reading notes): [spec.md](../spec.md)

This task supplies the lookup tables behind that verdict; the reading itself is T03.

### AC-05 — error

> **Given** the owner is choosing their country
> **When** they type a name that is not a country job-radar knows (for example "Polnd" or "Europe")
> **Then** no country is chosen, they are told that no country matches that name, and the list and the saved country stay as they were
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `vocabulary.ts`: fixed ISO alpha-2 list (incl. XK), `Intl.DisplayNames` names, flag from code, zones via `Intl.Locale` (`timeZones` getter or `getTimeZones()`), `offsetsFor(code, date)` → offsets on 15 Jan / 15 Jul of that year via `Intl.DateTimeFormat` `longOffset`
- [ ] Hand tables: aliases, regions (member codes), zone names → offsets (fixed and DST pairs), filler words, soft words, exception words, short codes
- [ ] `countryList()` ordered by name; `lookupCountry(name)` — English name, alias or flag, ignoring case and surrounding spaces; regions and unlisted two-letter codes return none
- [ ] `vocabulary.test.ts`: pins PL/US/GB/NZ names, zones and offsets (PL → +1 Jan / +2 Jul); lookup of "Poland", "poland ", "🇵🇱", "USA", "Türkiye" hits; "Polnd", "Europe", "CA" miss

## Edge cases

| Case | Behaviour |
|---|---|
| "Europe" typed in the chooser | No country (a region, not a country) — AC-05 |
| "CA" / "IN" | Not a short code — no country |
| "Puerto Rico" vs "USA" | Separate entries; USA's members do not include PR |
| A code `Intl` does not name in English | Left off the list |
| Southern-hemisphere DST (NZ) | 15 Jan / 15 Jul offsets still give both of its offsets |

## Definition of Done

**Done when:** `vocabulary.test.ts` passes: PL/US/GB/NZ pinned (names, zones, winter and summer offsets), the lookup accepts name/alias/flag case-insensitively and refuses "Polnd", "Europe" and "CA".

- [ ] `vocabulary.test.ts` passes
- [ ] no new dependency added (ADR-0003)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
