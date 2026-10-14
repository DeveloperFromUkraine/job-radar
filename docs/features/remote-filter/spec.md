---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-14"
feature_size: "S"
---

# Spec — remote-filter

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** None — only the interview, `CONTEXT.md`, `docs/idea-brief.md`, `docs/roadmap.md` (step 5), `docs/architecture-map.md`, the [remote-boards-collector](../remote-boards-collector/spec.md), [search-postings](../search-postings/spec.md) and [applied-skipped](../applied-skipped/spec.md) specs, and the distinct location restrictions held in the owner's local collection on 2026-10-14.

## 1. Context

The owner — a software engineer in Poland looking for global remote roles — sees every open posting job-radar collects, but "remote" rarely means "from anywhere". On 2026-10-14 the collection held 162 listings: most state a country or region that leaves Poland out ("USA" alone on 37, "LATAM", "Canada, USA", "APAC"), and about 17% state nothing at all. The owner reads each posting's location restriction by eye and discards the ones they cannot take — the exact ambiguity the idea brief names as half of the problem (§2: "'Remote' is ambiguous: many remote postings are restricted to one country or region, and every posting phrases that differently").

Why now: search (roadmap step 3) and applied/skipped marks (step 6) have shipped, so the list is the owner's daily feed; every posting that is not open to Poland is noise the owner filters by hand, every day of an active job search. The roadmap orders the remote filter in the wave right after search.

Committed approach — **one location verdict per posting, on by default, that hides only what is clearly not open to the owner's country and marks everything uncertain.** The owner picks their country once; job-radar reads each listing's stated location — countries, regions that contain the country, Worldwide, and time-zone ranges that cover the country in winter or in summer — and gives every posting one verdict: fits, check, or not open. Only "not open" is hidden, and the main screen says how many were hidden and lets the owner switch the filter off. Anything the filter cannot read with confidence — nothing stated, unfamiliar wording, an exception such as "except Poland", or countries that leave the owner out while the working hours fit — is shown with a "check location" mark, never hidden. The second mode, "open to country X", applies the same rules to a one-off country without changing the owner's own. A source's explicit "Anywhere" is kept as stated and read as Worldwide instead of unknown, so the mark stays rare enough to mean something. Why this: competitive research (2026-10-14) found that the closest product, one board's "Eligible for me" filter, keeps unreadable locations but does not mark them, and covers only its own listings; Himalayas splits country and time zone into two filters and silently drops postings with no stated zone; none combines countries, regions and time zones into one remembered verdict across several boards. The sharpest failure found by the adversarial pass is the silent wrong hide — a posting the owner could take, hidden because its wording was unfamiliar — which would break search's promise that no matching posting is silently missing (search-postings §2); hence "hide only on a confident reading". The owner's success test: no good posting is ever hidden, and the list stops carrying roles the owner cannot take (§7).

Traceability: the location restriction is kept exactly as each source states it, unknown when it states nothing (collector AC-21, AC-22) — this feature changes the collector's reading of a bare "Anywhere" — kept as stated instead of unknown, still never blocking a merge (AC-10 here; amends collector US-07, the AC-22 note decided in review B11, and §8 Q1's reading of We Work Remotely); a posting merged from several boards carries each listing's own statement (collector AC-04); the list, its counts, the "new" mark and the waiting count come from search (search AC-10, AC-11, AC-14, AC-16); marked postings leave the main list and live in the marked view (applied-skipped).

Search rules this feature amends while the filter is on: search AC-01 and AC-10 (the list holds every open posting that matches — now minus those not open to the owner's country, and the total counts what is shown, AC-07), AC-11 (the empty-list message gains the filter case, AC-08), AC-14 and AC-16 (the "new" and waiting counts count only what the filter shows, AC-09), the Currency NFR ("present in its results" — unless the filter hides them), and the "Silently missing matches" KPI (a posting the filter hid is counted by this spec's "Wrongly hidden postings" KPI instead). With the filter off every search rule holds unchanged.

Size and scope against the roadmap: roadmap step 5 was sized M with a "company in country X" mode. Classified S here (owner, 2026-10-14): the verdict reads statements the collector already keeps, and the second mode became "open to country X" — the same rules for a one-off country — because no source states a company's own country (§3). The one collector touch (AC-10: two source readers and the merge rule's treatment of "Anywhere") puts this step in the collector's code, so roadmap step 10 (LinkedIn adapter) lands after it rather than in the same wave; roadmap step 5 and the wave table are amended accordingly.

The adversarial pass also surfaced: restrictions written only in the description, mixed country-plus-time-zone statements, exception wording, seasonal time-zone shifts, name collisions between countries, and format changes at a source — each is handled in §5 or held in §3 / §8.

## 2. Goals

- The owner's main list holds only postings they may take from their country, or postings whose location honestly needs a look.
- No posting the owner could take is hidden by the filter.
- The owner can check any other country's openings in the same list without losing their own setting.

## 3. Non-goals

- Reading restrictions from the posting's description ("must be based in the US") — the filter reads only the stated location restriction; description text is free-form and reading it reliably belongs with the match score (roadmap step 4), which reads descriptions anyway.
- The company's own country (headquarters, legal seat) — no source provides it; the second mode is "open to country X", which covers the owner's real question (could someone in X take this role).
- Visa, work-permit, relocation or contract-type questions — not stated in the location restriction and not the pain named.
- More than one home country for the owner at once (dual citizenship, two places of residence) — v1 holds one country; the second mode covers a one-off look at another.
- Filtering the marked view — marked postings are the owner's own decisions and stay visible there whatever their location.

## 4. User stories

### US-01: Hide roles I can't take
**As an** owner
**I want** postings whose stated location leaves out my country to disappear from my list
**So that** I stop reading roles I cannot take

### US-02: See uncertain locations marked
**As an** owner
**I want** postings whose location is unknown or unclear to stay in my list with a mark that says why
**So that** a role I could take is never hidden just because its board phrased the location badly

### US-03: Set my country once
**As an** owner
**I want** to choose my country once and have job-radar remember it
**So that** the filter works every time I open the list

### US-04: Check another country
**As an** owner
**I want** to see the postings open to another country with the same rules, for a moment
**So that** I can weigh a move or a contract there without changing my own setting

### US-05: Know what the filter hides
**As an** owner
**I want** to see how many postings the filter hid, why the list may be empty, and to switch the filter off
**So that** I always trust that the shorter list is the filter's doing and not a broken collector

### US-06: Count "Anywhere" as open to me
**As an** owner
**I want** a posting its board marks as open "Anywhere" to count as open to my country
**So that** the most open roles are not the ones carrying a "check" mark

## 5. Acceptance criteria

### AC-01 (US-01) — happy
**Given** the owner's country is Poland, the filter is on, and open postings state "USA", "LATAM", "EMEA", "Europe", "Poland", "🇵🇱 Poland, 🇺🇦 Ukraine", "Worldwide" and "UTC-1 to UTC+3"
**When** the owner opens the main screen
**Then** the list shows the EMEA, Europe, Poland, flag-list, Worldwide and UTC-range postings, each with its location as the source stated it, and does not show the USA and LATAM postings

> Fits: the stated location names the country (by name, common short name or flag), names a region that contains it, says Worldwide, or — when it names no country or region — gives time zones that cover one of the country's offsets during the year (Poland: UTC+1 in winter, UTC+2 in summer), so the verdict does not change with the season. Country names match only as whole names ("Oman" is not found in "Romania"); a name that is both a country and a part of another country (Georgia) counts as unreadable unless the rest of the statement decides. The region list and which countries each region contains are fixed in design and covered by the §6 example set.

### AC-02 (US-02) — domain invariant
**Given** the owner's country is Poland and open postings state nothing, "Helsinki", "Worldwide except Poland", and "United States, UTC-10 to UTC+14"
**When** the owner opens the main screen
**Then** all four stay in the list, each marked "check location" with the reason — location not stated / location not recognised / mentions an exception / only working hours fit — because a location the filter cannot read with confidence is never hidden

> "Only working hours fit": the statement names countries or regions that leave the country out, but its time zones cover the country. An exception is any "except", "excluding", "not", "outside" wording; such a statement is never read as fits and never hidden.

### AC-03 (US-02) — domain invariant
**Given** a posting merged from two boards, one listing stating "USA" and the other stating nothing; another whose listings state "USA" and "Anywhere"; and a third whose listings came to state "EMEA" and "USA" after they were merged (a listing changed its statement later — collector AC-21, earlier merges are not re-decided)
**When** the owner, in Poland, opens the main screen
**Then** the first posting is shown marked "check location", the second is hidden ("Anywhere" is set aside when another listing of the same posting states something specific), and the third is shown as fitting; a posting is hidden only when every one of its open listings states a readable location that leaves the country out

### AC-04 (US-03) — happy
**Given** the owner has never chosen a country
**When** they open the main screen, choose Poland, and later close and reopen the app
**Then** before choosing they see every open posting with a prompt to choose their country; after choosing, the list is filtered for Poland; on reopening, Poland is still chosen and the filter is still on

### AC-05 (US-03) — error
**Given** the owner is choosing their country
**When** they type a name that is not a country job-radar knows (for example "Polnd" or "Europe")
**Then** no country is chosen, they are told that no country matches that name, and the list and the saved country stay as they were

### AC-06 (US-04) — happy
**Given** the owner's country is Poland
**When** they choose to see postings open to Germany
**Then** the list shows the postings that fit or need a check for Germany under the same rules, the screen says it is showing postings open to Germany, the owner's saved country stays Poland, and the next time the main screen is opened it filters for Poland again; an owner who has not chosen a country yet can still look at Germany this way, and afterwards is back to the unfiltered list with the prompt to choose (AC-04)

### AC-07 (US-05) — happy
**Given** the filter for Poland hides 38 of 140 open postings that match the owner's skills
**When** the list is shown
**Then** the owner sees "102 postings — 38 hidden, not open to Poland", pages through those 102 (search AC-15), and has one action to switch the filter off; switching it off shows all 140 without any "check" or hidden distinction, and the filter stays off on the next opening until the owner switches it on, with the screen saying the location filter is off and offering to switch it on

### AC-08 (US-05) — error
**Given** the owner's skills match 12 open postings and the filter hides all 12
**When** the owner searches
**Then** they see that no posting open to Poland matches, that the filter hid 12, and one action to switch the filter off — not only the action to clear the skills

> When hidden and marked postings together empty the list, this message wins over applied-skipped's "nothing left to review" (applied-skipped AC-13) whenever the filter hid at least one posting, since switching the filter off is the only action that brings something back; with nothing hidden, applied-skipped AC-13 applies unchanged.

### AC-09 (US-05) — domain invariant
**Given** the filter is on and, since the list was loaded, the collector added 5 postings, 3 of them not open to the owner's country
**When** the owner looks at the waiting count and then refreshes
**Then** the screen says 2 new postings are waiting, the refreshed list shows those 2 as new, and the "new" count and the hidden count agree with what the list shows; a hidden posting first collected since the previous visit is shown as new if the owner switches the filter off during the same visit

### AC-10 (US-06) — cross-context
**Given** a source states only "Anywhere" or "Anywhere in the World" for a listing
**When** the listing is collected
**Then** the location restriction is kept as the source stated it ("Anywhere" is what the owner sees) and the filter reads it as Worldwide, so the posting fits for any country; for merging it still counts as stating nothing, so it never keeps two listings of the same role apart (collector AC-05); when the same source lists countries beside "Anywhere", the countries are the statement; a listing already held as unknown takes the new reading the next time its source offers it

> This replaces the collector's earlier reading — the AC-22 note (Jobicy's "Anywhere" recorded as unknown, citing Jobicy's docs: "`Anywhere` when no region is specified"; review B11) and §8 Q1 (We Work Remotely's "Anywhere in the World" counted as nothing stated) — and narrows collector US-07's "never mistakes a missing restriction for 'work from anywhere'": a source that states nothing at all is still unknown (collector AC-22); only an explicit "Anywhere" is read as open. The residual risk — an employer who wrote "Anywhere" but restricts in the description — is accepted (§3).

### AC-11 (US-01) — cross-context
**Given** the owner marked a posting at Acme applied, and a look-alike Acme posting that states "USA" is open
**When** the owner opens the main screen with the filter on for Poland, and then the marked view
**Then** the look-alike posting is hidden like any posting not open to Poland (its earlier-mark hint shows only when it is shown), and the marked view lists every marked posting whatever its location, unchanged by the filter

### AC-12 (US-03) — authorization
**Given** a visitor can reach the owner's machine over the network, or the owner opens a web page from another site in the same browser
**When** the visitor or that page tries to open the main screen, read or change the owner's country, the mode or the filter
**Then** they cannot — as with search (search AC-17) the whole app is reachable only on the owner's own machine, and as with marks (applied-skipped AC-16) another site cannot change the owner's settings, so nobody else can hide postings from the owner

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Search response with the filter on | ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings and up to 20 skills (unchanged from search) | the search integration test, rerun with the filter on for Poland |
| Verdict correctness | 100% of the fixed examples give the expected verdict: every distinct location restriction in the owner's collection on 2026-10-14, each judged for Poland, plus the whole-name, exception, mixed and merged examples of AC-01–AC-03 | unit test over the example list |
| Never a wrong hide on uncertainty | 0 postings hidden whose statement is unknown, unrecognised, contains an exception, or fits only by working hours | property test over generated statements with unfamiliar words, exceptions and empty values |
| Seasonal stability | the same verdict for every example on a winter date and a summer date | unit test running the example list at two dates |
| Phone layout | the country choice, mode and off switch are usable at 360 px width with no horizontal scrolling; every action is a target of at least 44×44 px | browser check at 360 px (manual at ship until search-postings §8 R6 is automated); design-system touch rule |

## 6.1 Security / privacy

- **Data classification:** internal — postings are public, the owner's country is a personal preference kept on their own machine.
- **Personal data touched:** one new field — the owner's chosen country (a country name; low sensitivity), stored locally and never sent anywhere.
- **AuthZ/AuthN impact:** none added — the app stays reachable only on the owner's machine (search AC-17); the filter reads postings the owner can already see.
- **Abuse cases:**
  - Markup or script inside a stated location: shown as plain text and never acts as markup, as for every posting field (search AC-09).
  - An extremely long or garbled location statement: read as "not recognised" and shown with the check mark — never hidden, never blocks the list.
  - A page from another site in the owner's browser tries to change the country or switch the filter on to hide postings: refused (AC-12).
  - A source rewrites its location format so the filter starts hiding its postings: the hidden count on the main screen rises and the owner can switch the filter off; whether source health should flag it is held in §8.
- **Security review:** N/A — no new access boundary, no new personal data beyond one locally kept preference, no new outside party.

## 7. Metrics / KPIs

- **Wrongly hidden postings** — baseline: n/a (no filter today); target: 0 postings, over the first 14 days after shipping, that the owner finds on a board, that job-radar holds open and that are open to Poland, but that the filter hid. Measured by the owner logging each case.
- **Location dead ends** — baseline: to be counted by the owner in the 7 days before shipping (postings opened from the list that turn out not open to Poland); target: at most 1 a week in weeks 2 and 3 after shipping among postings shown without a mark. Measured by the owner's daily one-line log.
- **"Check" share** — baseline: 17% of open postings had no stated location on any listing on 2026-10-14 (27 of 161; 21 of 28 listings at We Work Remotely); target: ≤ 10% of the open postings shown with the filter on carry the "check location" mark, 7 days after shipping. Measured by counting the marked postings in the list.

## 8. Open questions

- [ ] Should source health flag a source when the share of its postings the filter hides jumps (a sign the source changed its location wording)? Default now: no — the hidden count on the main screen is the signal. — owner: Volodymyr Kozlov, due: 2026-10-31
- [ ] Should "check" postings later be resolved from their description text when the match score reads descriptions? Default now: no — out of scope here (§3). — owner: Volodymyr Kozlov, due: 2026-10-31 (or when roadmap step 4 is specified, whichever comes first)
