---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-16"
feature_size: "S"
---

# Spec — realness-score

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** the interview, `CONTEXT.md`, `docs/roadmap.md` (steps 12 and 13), `docs/architecture-map.md`, the [match-score](../match-score/spec.md) and [remote-boards-collector](../remote-boards-collector/spec.md) specs, and the collector and search code (`collector/infra/schema.ts`, `collector/infra/sources/`, `collector/app/first-fill.ts`, `search/domain/order.ts`).

## 1. Context

The owner is a software engineer in Poland looking for global remote roles. Their main list holds every open posting that mentions a typed skill and is open to their country. With a profile, the list can be ordered by match score. A high score says the role fits. It does not say whether the role is still being filled. Some postings have been open for months, some are reposted again and again, some never state pay, and some sit on every board at once while the company is "always hiring". The owner applies to these first because they fit well, and hears nothing back. The roadmap's step 12 asks for the missing check: "rank stale or suspicious postings lower from signals the collector already keeps".

Why now: the match score shipped on 2026-10-16 (PR #7), and the best-match order now puts the best-fitting postings first. Fit alone now steers where the owner spends applications, so stale postings with a high fit get the most attention.

Committed approach: **a realness penalty that only lowers a posting's place in the best-match order, computed for free from collected data, with every lowered card naming its reasons.** The four realness signals are age, a long life on many boards, a repost and no stated salary. Age and long life measure the same thing, time, so only the larger of the two counts. The penalty is capped at 30 points, so no posting drops more than 30 points below its own match score. The card keeps its honest match score. The newest-first order is not touched, because applying early matters most for getting a reply. Postings without a score are lowered within their block, so the feature also works without a profile, without a key, or once the scoring cap is reached. Salary counts as stated when the board's own pay field or the posting's text gives an amount, so a posting that shows pay on its board is not lowered for "no salary".

Why this: competitive research (2026-10-16) found that the closest products either remove ghost postings (OfferRun Job Radar, Hiring Cafe) or score one board at a time (Skip This Job, ShouldApply). None lowers a posting beside an unchanged fit score, and none uses history across many boards, which only a collector reading many boards has. The published age tiers (30 days stale, 60 days likely inactive) seed the fixed thresholds. The sharpest failure the adversarial pass found is a wrong reason: a "no salary" reason next to a fit note that quotes the salary, or a repost reason on a real new headcount. After a few of those the owner stops trusting every reason and switches the feature off. So each signal is defined narrowly, every lowered card names every signal behind its penalty, and the owner's test (§7) checks the reasons by hand.

Traceability: the list, its counts, paging, the "new" mark and the newest-first order come from search (search AC-01, AC-10, AC-14, AC-15, AC-16). The best-match order and the card's match summary come from match-score (match-score AC-01, AC-11). Listings, merging, reopening, first fill and clean-up come from the collector (collector AC-04, AC-10, AC-11, AC-19). Marks and look-alike hints come from applied-skipped. The remote filter alone hides postings for location. This feature adds the realness signals, the penalty and the reason line. Match-score rule it amends: AC-11 (in best match first, the order uses the score minus the realness penalty, and within the unscored block less-lowered postings come first). Collector rules it amends: a listing also keeps whether its board stated pay, written on every fetch of the listing even when nothing else changed, and a posting keeps when it last reopened (collector AC-11), counted from when this ships. A listing collected before this ships has an unknown pay state until its next fetch, and an unknown pay state never counts as "no salary" (AC-06). Both upstream specs carry a back-reference to this spec until `design` writes the amended wording.

## 2. Goals

- Postings that are still being filled reach the top of the best-match order before stale or suspicious ones with a similar fit.
- Every lowered posting says why, in words the owner can check on the board in a few seconds.
- Realness never costs the owner a posting: nothing is hidden, no count changes, the newest-first order and the honest match score stay as they are.

## 3. Non-goals

- **Hiding stale or suspicious postings.** The research found that hiding is what makes other tools untrustworthy when a signal is wrong; the owner chose lowering only.
- **A live check against the company's careers page.** It needs company boards, which arrive with roadmap step 9; until then the signals use only collected data.
- **Per-signal tuning or weights set by the owner.** The rules are fixed in this spec with one on/off switch; tuning comes when the §7 checks show a rule is wrong.
- **Detecting fraud or data-harvesting postings.** The signals point to stale or not-really-hiring roles; a scam check is a different problem with different signals.
- **Recording employer replies.** The pain is "applications into the void", but job-radar does not know about replies; §7 uses the owner's marks and a hand check instead (§8).

## 4. User stories

### US-01: See live roles first

**As a** owner
**I want** postings with realness signals to sit lower in the best-match order than postings with a similar fit and no signals
**So that** I spend my applications on roles that are still being filled

### US-02: Know why a posting is lower

**As a** owner
**I want** each lowered posting to name every signal behind its penalty
**So that** I can check the reason on the board and decide for myself

### US-03: Switch realness off and on

**As a** owner
**I want** to switch the realness penalty off and on again
**So that** I can see the plain best-match order when I doubt the signals

### US-04: Realness without a score

**As a** owner
**I want** postings without a match score to be lowered by their signals too
**So that** the feature works before I set up a profile, without a key, or after the scoring cap is reached

### US-05: Keep newest first and nothing hidden

**As a** owner
**I want** the newest-first order, the counts and the shown match score to stay exactly as they are
**So that** I never miss a fresh posting because of a signal

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** realness is on, the owner's list is in best match first, and it holds posting A with match score 88 and no signals, posting B with match score 92, posted 65 days ago and stating no salary, and posting C with match score 70 and no signals
**When** the owner opens the list
**Then** they see A (88), then C (70), then B (92 minus 25 is 67); each card still shows its own match score, A 88, C 70 and B 92; postings with an equal score after the penalty keep their newest-first order

> Penalty points: posted or first found 30–59 days ago 10; 60 or more days ago 20; open at three or more enabled sources and first found 45 or more days ago 15 (the larger of this and age counts, not both); reposted 10; no stated salary 5. The total is capped at 30. "N days ago" counts calendar days in the owner's time zone between the time and today, for both the thresholds and the number on the card.

### AC-02 (US-02) — happy

**Given** realness is on and a posting in the owner's list was reposted, states no salary and was first found 47 days ago, with no publication time from its sources
**When** the owner sees its card, in either order
**Then** the card shows one line naming every signal behind the penalty, for example "Lowered: first found 47 days ago · reposted · no salary listed" in best match first, and the same signals as "Signals: …" in newest first, where nothing was lowered; an age says "posted N days ago" only when the time it counts from is the publication time (AC-07), and "first found N days ago" otherwise, including when a source gives a publication time later than when job-radar first found the posting; a long life on many boards says "on 4 boards · first found 50 days ago"; when both time signals apply, the line names only the one that counts (AC-01); a posting with no signal shows no line

### AC-03 (US-01, US-05) — domain invariant

**Given** realness is on and some postings in the owner's list carry realness signals
**When** the owner looks at the list in either order, with or without a profile, and with the remote filter on or off
**Then** the list holds exactly the postings it would hold with realness off, every count (the list total, the hidden count, the marked count) is the same, every card shows the same match score and fit note as with realness off, and no posting's penalty is above 30 points

### AC-04 (US-05) — domain invariant

**Given** realness is on and the owner's list is newest first
**When** the owner opens the list or asks for more
**Then** the postings are in exactly the newest-first order search gives them, with or without signals; postings with signals show them as "Signals: …", never as "Lowered" (AC-02)

### AC-05 (US-04) — happy

**Given** realness is on, the owner's list is in best match first, and 12 postings have no match score (pending, cap reached, could not be scored, or no profile yet): 8 with no signal and 4 with signals
**When** the owner opens the list
**Then** the postings without a score still come before every scored posting (match-score AC-11), and within that block the 8 come first, newest first, then the 4 from the smallest penalty to the largest, equal penalties newest first; this holds when no profile exists and when scoring has a problem

### AC-06 (US-01, US-02) — domain invariant

**Given** a posting states its pay — any of its open listings from an enabled source has an amount in its board's own pay field, or the title or description of any of those listings gives an amount of money as pay, such as "$120k", "120–150K USD", "PLN 20 000–25 000 net B2B", "18 000 zł/mies.", "€60,000 a year" or "30k/month"
**When** job-radar works out its realness signals
**Then** the posting has no "no salary" signal; wording without an amount ("competitive", "DOE", "attractive package", "market rate") counts as no stated salary, and amounts that are not pay ("$5M Series A", "$2,000 learning budget", "$1B ARR") are never read as a salary; a listing whose pay state is unknown (collected before this shipped and not fetched since, §1) on a board that has a pay field counts as stating pay until its next fetch

### AC-07 (US-01, US-02) — domain invariant

**Given** a posting whose age is worked out from its time as search orders it — its publication time, but never later than when job-radar first found it — including postings collected in the collector's first fill
**When** that time is 30 days ago or more
**Then** it has the age signal; a posting collected in the first fill with no publication time counts from when it was first found and its reason says "first found N days ago", never "posted"; so does a posting whose publication time is later than when it was first found; a posting reopened by the collector keeps the time search orders it by, and also has the repost signal (AC-08)

### AC-08 (US-01) — cross-context

**Given** the collector reopened a posting after it had closed (a reopening since this shipped), or the owner's collection holds an earlier, closed posting (marked or not) that matches this posting by the look-alike matching rule (company and title as in CONTEXT "Look-alike posting", applied here to any earlier posting, not only a marked one), whose time as search orders it (publication time, never later than first found) is more than 7 days before this posting's
**When** job-radar works out the posting's realness signals
**Then** it has the repost signal; a posting merged from listings within 7 days of each other (collector AC-04) is one posting and is not a repost; two copies collected on the same day in the first fill, published more than 7 days apart, are a repost; a posting whose earlier copy was already removed by clean-up has no repost signal; while the earlier matching posting is still open, the two are read as parallel hires and neither has the repost signal; a look-alike posting keeps its look-alike hint (applied-skipped) next to the reason line

### AC-09 (US-01) — cross-context

**Given** a posting is open at four sources and was first found 50 days ago, and one of those sources is then disabled by the owner
**When** the owner next loads the list
**Then** only listings still offered by enabled sources count toward "on N boards", so it reads "on 3 boards · first found 50 days ago" and keeps that signal; with two enabled sources left it has only the age signal; a change the collector makes to a posting (a new listing, a reopening, new text stating pay) changes its signals from the next time the list is loaded or refreshed

### AC-10 (US-03) — happy

**Given** realness is on
**When** the owner switches it off
**Then** best match first orders by match score alone (match-score AC-11), no card in either order shows a "Lowered" or a "Signals" line, and the choice is kept for the next opening; switching it on again restores the penalty and the reason lines at once; realness is on when the owner first opens the list after this ships

### AC-11 (US-03) — error

**Given** the owner switches realness off or on
**When** job-radar cannot save the choice
**Then** the switch returns to its previous state, the list keeps its previous order, and the owner sees that the choice was not saved and can try again

### AC-12 (US-03) — authorization

**Given** a visitor can reach the owner's machine over the network, or the owner opens a web page from another site in the same browser
**When** the visitor or that page tries to switch realness off or on, or to read the list with its reasons
**Then** it cannot — as with search (search AC-17) the whole app is reachable only on the owner's own machine, and as with marks (applied-skipped AC-16) another site cannot act on the owner's behalf

### AC-13 (US-05) — cross-context

**Given** realness is on
**When** the remote filter decides a posting's location verdict, the owner marks a posting applied or skipped, or job-radar works out a match score
**Then** none of them changes because of realness: the remote filter hides exactly the same postings, marks move postings out of the list as before, the "new" mark shows as before, the match score and its terms part are worked out from the posting and profile alone, and realness asks the language-model provider for nothing and adds nothing to the scoring cap's spend

### AC-14 (US-02) — happy

**Given** a posting in the owner's list, with realness on or off and in either order
**When** the owner marks it applied or skipped
**Then** job-radar keeps, with the mark, the posting's penalty and signals at that moment as realness would work them out with the switch on, so the §7 checks can compare marks on lowered and not-lowered postings; the first time the owner opens the list on a calendar day of their time zone, it also keeps the share of postings in that list that had a penalty, counted on the list as the owner's saved skills and remote filter give it (a one-off look is ignored); a day the list is not opened has no share; changing the mark keeps the record of the latest mark only, and clearing the mark removes its record

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Search response with realness | ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings, scores and realness on, in either order — unchanged from search | the search integration test, rerun with realness on and best match first |
| No hiding | 0 postings left out of the list or its counts because of realness | property test: the list with realness on and off holds the same postings and counts |
| Newest-first unchanged | 0 differences in the newest-first order between realness on and off | property test over generated postings with signals |
| Salary rule accuracy | ≥ 95% of a fixed set of at least 100 real postings get the right "no salary" decision, at least 20 of them stating pay only in the board's own field and at least 20 with non-pay amounts | a fixture set labelled by hand, checked in the unit tests |
| Cost | 0 provider requests and $0 added to the scoring cap's spend by realness | unit test over what realness calls; scoring health spend unchanged |
| Phone layout | the reason line and the switch are usable at 360 px with no horizontal scrolling; the switch is at least 44×44 px | browser check at 360 px (manual at ship); design-system touch rule |

## 6.1 Security / privacy

- **Data classification:** internal — signals are derived from public postings and the owner's own collection on their machine.
- **Personal data touched:** none. Realness reads postings, listings and marks only; it reads no profile field and sends nothing anywhere.
- **AuthZ/AuthN impact:** none new. The switch and the reasons are reachable only on the owner's machine, and cross-site requests are refused as for every other change in the app (AC-12).
- **Abuse cases:**
  - A posting's text claims a salary it doesn't mean ("salary: $1") to avoid the "no salary" signal: it can only avoid a lowering, never raise a posting above its honest match score.
  - Posting text tries to steer the reason line: the reason line is built from fixed phrases and numbers job-radar works out, never from posting text.
  - A visitor or another site switches realness off to change what the owner sees: refused (AC-12).
- **Security review:** N/A — no new boundary, no personal data, no outside requests; the one new setting is protected exactly like the existing ones.

## 7. Metrics / KPIs

- **Reason precision** — baseline: 0 (new); target: in a hand check of 20 lowered cards against their boards within 14 days of shipping, at least 18 have every named signal true (pay really absent, age right within 1 day, the repost or the board count real).
- **Applications go to live roles** — baseline: TBD, the average of the daily shares kept on the days in the first 7 days after shipping that have one (AC-14); target: within 30 days of shipping, the share of postings the owner marks applied that were lowered when marked is at most half that baseline share.
- **Lowered postings get skipped** — baseline: 0 (new); target: within 30 days of shipping, postings that were lowered when marked are marked skipped at least 1.5 times as often (as a share of their marks) as postings that were not lowered.
- **Trust** — baseline: 0 (new); target: realness is still on 30 days after shipping.

## 8. Open questions

- [ ] Which boards state pay in their own field, and in what form? Default now: Himalayas, Remotive, Jobicy and Remote OK are assumed to have a pay field and We Work Remotely none; the collector keeps "pay stated" per listing where the board gives it. — owner: Volodymyr Kozlov, due: before `/sdd:design realness-score`
- [ ] Are the thresholds and points right (30/60 days, 3 boards for 45 days, 10/20/15/10/5, cap 30)? Default now: as in AC-01, taken from the published age tiers. — owner: Volodymyr Kozlov, due: 2026-11-30, after the §7 hand check
- [ ] Should job-radar learn about employer replies so the success can be measured directly? Default now: no; §7 uses marks and a hand check. — owner: Volodymyr Kozlov, due: when roadmap step 7 (alerts) is specified
- [ ] When company boards exist (roadmap step 9), does "not on the company's careers site" become a fifth signal? Default now: yes, as its own spec. — owner: Volodymyr Kozlov, due: when step 9 is specified
- [ ] Salary-rule residuals left after the review rounds of 2026-10-16 ([review 5](./_review/review-2026-10-16-5.md)). Do they show up in real postings? Default now: unread as listed. Harmful (a stated salary read as "no salary"): "This position pays $52,000 …" (no "pays" pay word); pipe-separated headers with no pay word ("Acme | Senior Engineer | Remote | $150k | Health insurance"); intern stipends ("Stipend: $2,500 per month for interns"); Indian digit grouping ("₹15,00,000", "15 LPA"). Harmless (a perk read as pay): "We pay $100/month for your phone", "Competitive salary plus $1,200 per year for wellness", "Our earnings grew to $40,000,000". — owner: Volodymyr Kozlov, due: 2026-11-30, at the §7 hand check (count each in the hand-checked postings; widen pay.ts only for those found)

## Test plan

Levels: unit (rules, phrases, order — no I/O), integration (server against a throwaway database created per suite and removed after, never a mocked store), contract (the realness settings shape against `contracts/openapi.yaml`), component (the reason line and the switch rendered in isolation). E2e here is the server-side flow from collected postings to the search answer. E2e-through-UI and visual-regression: <!-- N/A: the repo has no driven-UI or visual-diff layer; the 360 px check stays manual at ship (§6) -->.

### AC coverage

| AC (§5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 | penalty points follow the thresholds, the larger time signal counts, total capped at 30 | unit | 29/30/59/60-day and 44/45-day edges score as AC-01 says; no total above 30 |
| AC-01 | best match orders by score minus penalty, ties keep newest-first | unit + integration | A (88), C (70), B (67) in that order; cards still show 88, 70, 92 |
| AC-02 | reason line names every counted signal in fixed phrases | unit | "Lowered: first found 47 days ago · reposted · no salary listed"; "posted" only when counted from publication time; only the counting time signal named; no signal → no line |
| AC-02 | many-boards phrase reads "on N boards · first found D days ago" | unit | the phrase uses enabled boards and first-found age |
| AC-02 | card shows "Lowered" in best match and "Signals" in newest first beside an unchanged score | component | right prefix per order; no line without signals; score untouched |
| AC-03 | list with realness on and off holds the same postings, counts, scores and fit notes | integration | seeded loop over generated postings, both orders, profile on/off, remote filter on/off: zero differences; every penalty ≤ 30 |
| AC-04 | newest-first order is identical with realness on and off, across every page | integration | same id sequence when paging the whole snapshot |
| AC-04 | newest-first cards never say "Lowered" | component | signals shown as "Signals: …" only |
| AC-05 | unscored block: no-signal postings first newest-first, then by penalty ascending, ties newest-first | unit + integration | the 8 then the 4 in that order, still above every scored posting; holds with no profile and with a scoring problem |
| AC-06 | salary amounts in text are read as pay; vague wording and non-pay amounts are not | unit | ≥ 95% right on the labelled set (§6); every example in AC-06 decided as written |
| AC-06 | a board's own pay field is kept on every fetch and clears "no salary" | integration | refetch with unchanged text updates the pay state; a posting with pay in the field has no "no salary" signal |
| AC-06 | an unknown pay state on a pay-field board never counts as "no salary" | unit | no "no salary" signal until the next fetch |
| AC-07 | age counts from publication time, never later than first found | unit | first-fill posting without publication time and one published after first found say "first found N days ago"; 30-day edge in the owner's time zone |
| AC-07 | a reopened posting keeps its ordering time and gains the repost signal | unit | age unchanged, repost present |
| AC-08 | repost rules: reopening, earlier closed look-alike > 7 days before, merged listings, first-fill copies, cleaned-up earlier copy, still-open earlier copy | unit | repost only for the reopening and the closed look-alike > 7 days earlier and the first-fill pair published > 7 days apart; none for the rest |
| AC-08 | collector records the reopening time and exports closed earlier postings | integration | reopened posting carries the repost signal on the next list load; look-alike hint still shown |
| AC-09 | disabling a source lowers the board count from the next list load | integration | 4 → 3 boards keeps the signal; 2 boards leaves only age; a new listing or new pay text changes signals on the next load |
| AC-10 | realness settings read and write match the agreed shape | contract | real responses validate against `openapi.yaml` |
| AC-10 | switch defaults to on, is kept between openings, and off means score-only order with no lines | integration | first open is on; off persists; best match by score alone; on restores penalty and lines |
| AC-10 | switching reloads the list with or without reason lines | component | lines disappear and return with the switch |
| AC-11 | a failed save puts the switch back, keeps the list and offers retry | component | switch in its previous state, list order unchanged, message shown, retry saves |
| AC-12 | a request from outside the owner's machine or from another site is refused on every realness and search route | integration | refused; the setting stays as it was and no list with reasons is returned |
| AC-13 | filter verdicts, marks, the "new" mark and match scores are the same with realness on and off | integration | identical hidden set, mark moves, "new" marks and scores |
| AC-13 | realness makes no provider request and adds no scoring spend | integration | zero requests to the fake provider from realness; scoring health spend unchanged |
| AC-14 | a mark keeps the posting's switch-on penalty and signals; changing keeps the latest, clearing removes it | integration | one record per marked posting, with realness off too; latest mark only; none after clearing |
| AC-14 | the day's first opening of the saved-skills list keeps the lowered share once | integration | one share per calendar day in the owner's time zone; a one-off look and later openings that day add nothing |

### Edge cases / error paths

- Every posting at the cap → penalty exactly 30, never above.
- Posting with no signals → no reason line in either order.
- Owner's time zone near midnight → "N days ago" and the thresholds use calendar days in that zone.
- Unknown pay state on a board without a pay field → falls back to the text check only.
- Settings save fails → AC-11 row: previous state kept, retry offered.
- Outsider or cross-site request → AC-12 row: refused, nothing changed.
- Search response over budget with realness on → the per-listing pay decision is memoised (sad §7) and re-measured; the assertion is never skipped.

### Test data

- Seed: extend the existing posting and tracking fixture builders with the pay field, the reopening time, closed look-alike postings and per-source listings; the labelled salary set is a checked-in fixture of ≥ 100 real postings (≥ 20 pay only in the board field, ≥ 20 with non-pay amounts).
- Dependency: a throwaway database per suite, created and removed by the existing temp-database helper; the language-model provider is the existing fake (it is an outside service, not our store).
- Cleanup boundary: per suite for the database; the property loop reseeds per iteration from a fixed seed so failures replay.

### NFR validation (load)

- Search ≤ 1 s p95 → 10,000 open postings with scores and realness on: 50 sequential searches and 50 next-page requests (one owner, no concurrency), in best match first and in newest first; assert p95 ≤ 1 s for each. Rerun of the existing search latency test shape — the load tool already in the repo, or e.g. k6 / Locust.

### CI placement

- Every PR: unit, contract, component and the integration suites (including the property loop).
- Pre-release: the 10,000-posting latency run and the manual 360 px phone check.
