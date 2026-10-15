---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-14"
feature_size: "S"
ticket: "roadmap step 5"
---

# 0003 — Build the country vocabulary from Intl plus small hand-kept tables

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

The filter has to recognise a country by name, common short name or flag ("USA", "United States of America", 🇺🇸). It has to know each country's UTC offsets in winter and in summer (Poland: +1 and +2), which countries each region contains (EMEA, LATAM, APAC, Europe), and the fixed filler-word, zone-name and short-code lists (spec AC-01). The country chooser must offer exactly the countries the filter can read (spec §8 Q3 default). Spec §8 Q3 asks which places are on the list and which names each accepts, due before design completes. This ADR answers it.

## Decision drivers

- Spec §6 Seasonal stability: the same verdict on a winter date and a summer date. Offsets must follow real daylight-saving rules.
- Spec §6 Verdict correctness: every distinct statement in the 2026-10-14 collection must give its expected verdict. These include WWR's ISO official names ("Moldova (Republic of)", "United Kingdom of Great Britain and Northern Ireland") and Jobicy's short codes ("USA", "UK").
- Fewer moving parts: every dependency is one more thing to keep current on a one-person project.
- One list feeds both the chooser (web) and the filter (server).

## Considered options

1. **`Intl` plus small hand-kept tables.** A fixed list of ISO 3166-1 alpha-2 codes, territories included and with XK for Kosovo. Each code's English name comes from `Intl.DisplayNames`, its flag is derived from the code, its time zones come from `Intl.Locale` region info, and each zone's offset on a date comes from `Intl.DateTimeFormat`. A few tables are kept by hand in `remote-filter/domain`: aliases, region membership, zone names, filler words and short codes.
2. **A countries dataset dependency** (country, time-zone and UN-region data from npm), plus hand-kept recruiter regions and aliases.
3. **One hand-written table** of about 250 countries with their names and UTC offsets.

## Decision outcome

**Chosen:** Option 1. Names, flags, zones and daylight-saving offsets come from the ICU data that ships with Node, so there is no new dependency and no offsets to keep by hand. Checked on Node 22.23: PL → `Europe/Warsaw` → GMT+01:00 in January and GMT+02:00 in July. What `Intl` lacks is small, and a dataset would not supply it either: recruiter regions such as EMEA and LATAM do not match UN regions, and the aliases are specific to the sources. Option 3 would hand-copy data that goes stale when a country changes its daylight-saving rules.

**Answer to spec §8 Q3:**
- The country list is every code in the fixed list that `Intl.DisplayNames` names in English. A territory is a country of its own: Puerto Rico, Hong Kong and Kosovo can be chosen, and they match only their own names or a region that lists them. "USA" does not include Puerto Rico.
- Each country accepts its `Intl` English name, the aliases in the alias table, and its flag.
- The chooser and the filter use this one list (spec §8 Q3 default kept).
- The region, filler-word, zone-name and short-code lists are fixed in SAD §8.

## Consequences

**Positive**
- No new dependency. Offsets follow real daylight-saving rules for any date.
- The chooser and the filter can never disagree, because the server builds the list once and serves it to the web app.

**Negative**
- Region membership and aliases are hand-kept. A new source spelling ("Czech Republic", "Türkiye") needs one alias line, and the example-set test catches it the first time it appears.
- `Intl` output can change with a Node upgrade: a renamed country, or the region time-zone accessor, which is the `timeZones` getter in Node 22 and the `getTimeZones()` method in newer V8. The code reads both, and a unit test pins PL, US, GB and NZ.

**Neutral**
- English names only; the UI is single-language (search SAD §8).

## Links

- Spec: [[../spec.md]] AC-01, AC-05, §6, §8 Q3
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0002-decide-location-verdicts-on-read-when-search-builds-its-snapshot]]
