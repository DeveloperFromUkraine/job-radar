---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
---

# Spec — remote-boards-collector

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** None — only the interview, `CONTEXT.md`, `docs/idea-brief.md`, `docs/roadmap.md` (step 2, decision D1) and `docs/architecture-map.md`.

## 1. Context

The owner — a software engineer in Poland searching for global remote roles — finds jobs today by opening several remote job boards by hand, one after another. It is slow, easy to forget, and by the time a good role is noticed it may already have hundreds of applicants; the owner wants to be among the first to apply. Nothing in job-radar can help until postings exist inside it: search, match scoring, the remote filter, applied/skipped marks and saved-search alerts (roadmap steps 3–7) all read what this feature collects.

Why now: the project skeleton is built (roadmap step 1), and this is the step every other one waits on. The freshness decision (roadmap D1) is settled — hours, not a day — and the owner is in an active job search, so each week without a collector is a week of manual board browsing.

Committed approach — **a per-source schedule over a shared source contract.** Every enabled source is collected continuously, each at the cadence its own terms allow and that actually yields new data: Jobicy is the freshness source (polled hourly), Himalayas the completeness and location-data source, Remotive adds coverage at its slower allowed rate, and We Work Remotely joins once its terms are verified (§8 Q1) — until then it stays disabled. The same role seen on several boards becomes one posting that names and links every source; a posting is closed only on a reliable signal; and source health is visible so a broken source is never silent. This beat the three pure strategies: the pair-with-failover approach relied on two sources that are structurally 24 hours late (analyst, Executive lens: "misses core ≤2h freshness goal"; the hourly target was later set to ≤ 5 h from publication once Jobicy's 3 h publication delay was verified — §6), the all-sources-hourly mesh breaks Remotive's published limits, and the single-feed approach drops merging and health — the brief's top abandonment risk. The research gap it targets: existing aggregators are stateless per run or single-board; none keeps closed-state, owner marks and source health over time. RICE ≈ 1.05 (reach 1 owner · impact 3 · confidence 70% · effort 2 person-weeks); feasibility Tech ☑ (the skeleton already has a migrated database and a temporary-database test helper), Skills ☑ (the owner's chosen stack; sources publish plain feeds, no page scraping), Time ☑ (1–2 sprints). Size grew from the roadmap's S to M during specify: merging across sources, reliable closing, source health, catch-up and category settings were judged inseparable from a collector the owner can trust (the brief's top abandonment risk); roadmap step 2 is re-sized accordingly.

Traceability: source facts verified 2026-09-29 — Himalayas documents a 24-hour data cache; Remotive's free feed is delayed 24 hours and asks for at most ~4 fetches a day; Jobicy allows polling at most once an hour; We Work Remotely requires attribution, its limits and location data are unconfirmed.

Owner-facing surface: this feature ships one screen in the web app — source health, with collect-now, the run in progress and each source's outcome — plus a problem marker on the app's main screen (AC-13). Collected postings are browsed from roadmap step 3 on; until then the owner sees them only as counts in source health. In v1 the whole app is reachable only on the owner's own machine (AC-17); the mobile-first canon applies to layout, not to access from the phone.

## 2. Goals

- The owner no longer opens job boards by hand to learn what is new — every relevant new remote tech posting from the chosen sources is in job-radar.
- The owner sees new postings shortly after a source makes them available, so they can be among the first to apply.
- A broken or misbehaving source is never silent — the owner learns about it before it costs them postings: the problem shows on the app's main screen, not only in source health.

## 3. Non-goals

- Interpreting location restrictions into an eligibility verdict ("can I work from Poland?") — that is the remote filter (roadmap step 5); this feature only keeps what sources state.
- Searching, ranking or scoring postings — roadmap steps 3 and 4 consume what is collected here.
- LinkedIn and company ATS boards — roadmap steps 10 and 9; they plug into the same source contract later.
- Collecting while the owner's machine is off or the app is not running — an always-on host is a later decision (architecture map constraint).
- Republishing, exporting or sharing collected postings — every source's terms forbid it.
- The owner reaching job-radar from their other devices, the phone included — v1 is reachable only on the owner's own machine; remote access is decided together with the always-on host.
- Browsing collected postings or a "new postings" view — roadmap step 3; this feature shows postings only as counts in source health.
- Editing settings inside the app — sources and categories are set only in the owner's local settings file (US-08).
- Polish and other regional job boards (e.g. Just Join IT, No Fluff Jobs) — a separate roadmap step right after this one; they plug into the same source contract once each board's terms and access are verified.

## 4. User stories

### US-01: Collect new postings automatically
**As an** owner
**I want** new remote tech postings collected from every enabled source on that source's own schedule
**So that** I never have to open the boards to see what is new

### US-02: See each role once
**As an** owner
**I want** a role that several sources advertise to appear as one posting that names and links every source
**So that** I review it, mark it and apply to it once

### US-03: Keep closed postings out of my way
**As an** owner
**I want** postings that are really closed to be hidden, and old untouched ones to be cleared away
**So that** I only spend time on roles I can still apply to, without losing my own marks

### US-04: Know when a source misbehaves
**As an** owner
**I want** to see each source's health and have problems flagged in plain words
**So that** a broken source never silently shrinks what I see

### US-05: Collect now on demand
**As an** owner
**I want** to start a collection myself
**So that** I don't wait for the schedule after fixing a problem or before a job-hunting session

### US-06: Catch up after a pause
**As an** owner
**I want** collection to catch up as soon as the app starts again, and the very first start to fill the last 30 days
**So that** a night with the laptop closed doesn't leave me looking at yesterday's list

### US-07: Keep where-to-work-from exactly as stated
**As an** owner
**I want** each source's location restriction kept exactly as the source stated it, with "unknown" when it states nothing
**So that** the later remote filter never mistakes a missing restriction for "work from anywhere"

### US-08: Choose what gets collected
**As an** owner
**I want** to choose, in a settings file on my machine, which sources are enabled and which of their job categories count as tech
**So that** the collection holds only roles I could want and I can adjust when a board changes its categories

> **Visitor:** no user story — a visitor has no goal this feature serves; the role exists only to be kept out, covered by AC-17 and §6.1.

## 5. Acceptance criteria

> **Owner marks (AC-06, AC-07, AC-10, AC-11):** applied/skipped marks are introduced by roadmap step 6. These ACs state what the collector must preserve; they are verified now against test data that carries marks, and re-verified against real marks when step 6 ships.

### AC-01 (US-01) — happy
**Given** an enabled source is due and offers a new listing in one of the owner's tech categories
**When** the collection run reads that source
**Then** a new posting appears in the owner's collection with its title, company, publication time, the source's name and a link back to the source

### AC-02 (US-01) — domain invariant
**Given** a source's interval (§6) has not yet passed since its last read
**When** any collection run starts — scheduled, catch-up or collect-now
**Then** that source is not read again in this run, and its source health shows when it is next due

### AC-03 (US-01) — error
**Given** one enabled source cannot be reached, refuses the request, or returns something that cannot be read
**When** the collection run reads it
**Then** the other sources are still collected, no posting from the failing source is closed, and that source's health shows the failure with a plain-language reason

### AC-04 (US-02) — happy
**Given** a posting from one source is already in the collection
**When** another source — or the same source re-posting it as a new item — offers a listing from the same company with the same role title, with publication times no more than 7 days apart
**Then** the owner sees one posting that names and links both sources (or keeps the one source once)

> Matching: titles are compared ignoring letter case, punctuation and generic "remote" wording; company names the same way and also ignoring legal suffixes (Inc, Ltd, LLC, GmbH, Sp. z o.o. and similar). Generic "remote" wording is exactly: remote, fully remote, 100% remote, remote-first, work from home, WFH, anywhere — standalone, in parentheses, or after a dash or comma; region names (Worldwide, EU, US, Poland, LATAM and the like) are never removed, so "Remote – EU" and "Remote – US" stay different. The 7 days compare the new listing's publication time with the latest publication time among the posting's listings, as the sources state them. A merged posting shows the title and company of its first listing and the earliest publication time; every listing keeps its own. When the same source re-posts the role as a new item, the new item replaces the old one at that source (its link and location restriction win) and the old item is not counted as a closure.

### AC-05 (US-02) — domain invariant
**Given** the same company advertises two roles whose titles differ in anything beyond letter case, punctuation and generic "remote" wording — for example different regions or teams — or whose listings both state a location restriction and the two statements differ (an unknown restriction never blocks a merge)
**When** both listings are collected
**Then** they stay two separate postings, each with its own location restriction and link

### AC-06 (US-02) — cross-context
**Given** the owner has marked a posting as skipped
**When** a listing from another source is merged into that posting
**Then** the posting stays marked skipped and its first-found time does not change — it is not treated as a newly found posting

### AC-07 (US-03) — happy
**Given** every enabled source listing a posting has confirmed it is no longer open — a disabled source's listing does not count, and at least one enabled source must have confirmed
**When** the collection run records that
**Then** the posting is marked closed, hidden from the owner's open postings, and any applied or skipped mark on it is kept

### AC-08 (US-03) — domain invariant
**Given** a listing is missing from a source's fetch that failed, was cut short, or only covers that source's most recent items
**When** the collection run finishes
**Then** the posting stays open — a failed or partial fetch never closes a posting

### AC-09 (US-03) — domain invariant
**Given** a posting is listed by two sources and only one of them confirms it closed
**When** the collection run records that
**Then** the posting stays open and keeps the still-open source's link

### AC-10 (US-03) — happy
**Given** more than 60 days have passed since a posting closed, or since any enabled source last offered it — days on which all of its sources were disabled do not count
**When** clean-up runs (once a day, after the day's first collection run that finished without being interrupted — even if a source in it failed; the day is the calendar day in the owner's machine time zone)
**Then** the posting is removed if the owner never marked it, and kept if the owner marked it applied or skipped

### AC-11 (US-03) — happy
**Given** a closed posting has not been removed yet
**When** one of its sources offers the same item again, or any source offers a listing that AC-04 would merge into it (publication time within 7 days of the latest publication time among the posting's listings)
**Then** the same posting reopens with the owner's earlier marks, instead of a new unmarked copy appearing

### AC-12 (US-04) — happy
**Given** at least one collection run has finished
**When** the owner opens source health
**Then** they see for each source when it last succeeded, how many postings its last run added, updated and closed, and when it is next due

> "Updated" — an updated posting (CONTEXT): known postings whose title, text, location restriction or link changed at this source, that gained a listing from another source, or that reopened.
> Counts are per posting outcome, credited to the source that caused it: *added* — a new posting created from this source's listing; *updated* — an existing posting changed through this source, including this source's listing merging into it or reopening it; *closed* — postings that actually closed in this run where this source gave the last needed confirmation. Closures held back by AC-14 are shown separately as *held*, not as closed.

### AC-13 (US-04) — error
**Given** a source has failed on two consecutive due runs, returned zero items (not merely zero new ones) on two consecutive due runs, or has not been read for more than twice its interval while the app was running
**When** the owner opens the app
**Then** that source is flagged with a plain-language reason in source health, the app's main screen shows that a source has a problem, and the flag clears by itself after the source's next successful read that returns items

> Main-screen marker — shown while any flag that can cost the owner postings is up: failing / silent / overdue (AC-13, clears after the next successful read that returns items), closures held back (AC-14, clears when the next run of that source is at or under 30%), unusual unknown-location share (AC-25, clears when that source's next run is back under the threshold), unreadable settings file (AC-27, clears after the next valid read). Shown only in source health, without the marker: a category that matched nothing (AC-24) and defaults in use (AC-27). There is no in-app control to accept held closures in v1.

### AC-14 (US-04) — domain invariant
**Given** a source lists at least 10 open postings, and a single run of it would actually close (after AC-09) more than 30% of them
**When** the collection run finishes
**Then** those closures are held back (the postings stay open), and the source is flagged as possibly changed so the owner can check it; the next run of that source re-checks them by itself — at or under 30% they close, otherwise they stay held and the flag stays

### AC-15 (US-05) — happy
**Given** no collection run is in progress
**When** the owner asks to collect now
**Then** a run starts for every enabled source whose interval has passed since its last read, the owner sees it in progress, and then sees each source's outcome; if no enabled source may be read yet, no run starts and the owner sees when each source is next due

### AC-16 (US-05) — domain invariant
**Given** a collection run is already in progress
**When** the owner asks to collect now
**Then** no second run starts and the owner is told a run is already in progress

### AC-17 (US-05) — authorization
**Given** a visitor can reach the owner's machine over the network
**When** the visitor tries to start a collection or view source health
**Then** they cannot — in v1 the whole app is reachable only on the owner's own machine, so any other device on the network, the owner's own phone included, cannot connect to it at all

### AC-18 (US-06) — happy
**Given** an enabled source's own last successful read is older than its interval
**When** the app starts
**Then** a catch-up run for every such source begins within one minute of the start

### AC-19 (US-06) — happy
**Given** an enabled source has never been read — on the app's first start, or when a source is enabled for the first time later
**When** that source is first collected
**Then** it collects, newest first, as much of the last 30 days as the source offers (Jobicy offers only 7) and its allowed rate leaves after the regular reads — regular reads always come first — and the owner sees its first postings without waiting for the schedule

### AC-20 (US-06) — error
**Given** a collection run was interrupted — the laptop slept or the app stopped mid-run
**When** the app starts again
**Then** the interrupted run is recorded as incomplete, nothing is closed on its basis, and new runs are not blocked by it; listings it already collected are kept, every read it made counts toward that source's allowed rate, a source whose fetch finished before the interruption counts that read as its own last success, and a source whose fetch did not finish does not

### AC-21 (US-07) — happy
**Given** a source states where candidates may work from — as countries, regions, time zones or free text
**When** its listing is collected
**Then** the posting keeps that statement exactly as the source gave it, named after the source; when the source later changes the listing, the latest statement replaces the stored one (no history is kept), and earlier merges are not re-decided

### AC-22 (US-07) — domain invariant
**Given** a source states nothing about where candidates may work from
**When** its listing is collected
**Then** the posting's location restriction is recorded as unknown, never as "anywhere"

> Jobicy writes `jobGeo: "Anywhere"` when the employer named no region ("`Anywhere` when no region is specified", Jobicy API docs, read 2026-10-02), so that value counts as stating nothing and is recorded as unknown. Decided in review 2026-10-02 (B11); to re-check against a recorded live response — ADR-0004 addendum.

### AC-23 (US-08) — happy
**Given** the owner's tech category list, kept in their settings file, does not include a source's category
**When** that source offers a listing in it
**Then** the listing is not collected — a listing in several categories is collected if at least one is on the list; a listing with no category is not collected and is counted in source health; postings already collected under a category the owner later removes stay and age out as usual

### AC-24 (US-08) — error
**Given** the owner's tech category list names a category that is missing from the source's published category list — or, for a source that publishes none, that matched no listing in the last 7 days
**When** the source is collected
**Then** source health tells the owner that this category matched nothing at the source, so they can update the list

### AC-25 (US-04) — domain invariant
**Given** the source has at least 7 days of collected history, and in a single run more than half of its new listings have an unknown location restriction, and that share is at least twice the source's average share over the previous 7 days
**When** the collection run finishes
**Then** the listings are collected as usual and the source is flagged as possibly changed, with the unusual share named in the reason

### AC-26 (US-08) — happy
**Given** a source is disabled in the owner's settings file
**When** any collection run starts — scheduled, catch-up or collect-now
**Then** that source is not read, its existing postings are neither closed nor removed because of it (the AC-10 clock is paused while all of a posting's sources are disabled), its listings no longer count toward closing (AC-07), and source health shows it as disabled

### AC-27 (US-08) — error
**Given** the owner's settings file is missing, or cannot be read
**When** the app starts or a collection run starts
**Then** a missing file is created with built-in defaults (every source except We Work Remotely enabled, a default tech category list per source) and source health says defaults are in use; an unreadable file leaves collection running on the last valid settings and source health names the problem in plain words; a file that can be read but names an unknown source or otherwise breaks the settings rules counts as unreadable as a whole; an unreadable file with no last valid settings yet (e.g. on the first start) runs on the built-in defaults and is not overwritten; a source the owner enables while its allowed rate is 0 (We Work Remotely until §8 Q1) shows as "enabled, not read until its limits are verified" and is never flagged as silent; a valid edit takes effect from the next run without restarting the app

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Freshness (hourly-allowed sources) | ≤ 5 h from the source's publication time to the listing being in job-radar, p90, while the app runs (Jobicy: its documented 3 h publication delay + its 1 h interval + margin) | per-listing difference between the source's publication time and its first collection time, reported per source; the sample excludes the first 30-day fill, listings published while the app was not running, and listings with no publication time (those are counted separately in source health); a merged posting counts once per listing |
| Freshness (slower sources) | ≤ the source's documented delay + one allowed interval, from the source's publication time: Remotive ≤ 30 h, Himalayas ≤ 30 h (24 h cache + the default 6 h interval, §8 Q3); We Work Remotely set when it is enabled (§8 Q1) | same metric and sample as above, compared with the source's documented delay |
| Source request rate | never above each source's published limit (Jobicy ≤ 1 per hour; Remotive ≤ 4 per day and ≤ 2 per minute; Himalayas ≤ 4 per day until §8 Q3 sets its verified rate; We Work Remotely 0 — not read until §8 Q1 sets its verified limit). One read = one request to the source, pages and failed requests included; "per hour" / "per day" are rolling 60-minute / 24-hour windows; a retry happens only within the limit. A source may be read only once its interval has passed since its last read — scheduled, catch-up and collect-now alike; intervals are set so one read per interval stays inside the limit. If the limit is used up during a fetch, that fetch counts as partial (nothing is closed on its basis) and is not a failure for AC-13. Intervals: Jobicy 1 h, Remotive 6 h, Himalayas 6 h | count of reads per source per rolling window, checked in tests and visible in source health |
| Collection run duration | ≤ 5 min p95 for a regular run; first fill ≤ 30 min for hourly-allowed sources; slower sources show their first postings within 24 h and their fill continues over later runs inside their allowed rate, as far back as AC-19 allows | run start/finish times recorded per run; first-fill completion time per source |
| App start with a catch-up due | the app responds to the owner ≤ 5 s after start, even while catch-up or the first fill runs | start-up smoke test in CI |
| Problem detection | a failing or silent source flagged within 2 of its own intervals | AC-13 / AC-14 / AC-25 tests; time from first failure to flag, from run history |
| Retention bound | unmarked postings more than 60 days past closing or past the last offer from an enabled source (disabled-only days not counted, AC-10) removed on every daily clean-up | count of such unmarked postings = 0 after clean-up |

## 6.1 Security / privacy

- **Data classification:** internal — public job postings plus the owner's own marks; nothing leaves the owner's machine except requests to the sources.
- **Personal data touched:** none new — source listings contain no applicant data; the owner's applied/skipped marks are introduced by roadmap step 6; this feature only preserves them (see the §5 note).
- **AuthZ/AuthN impact:** no accounts; in v1 the whole app — including the collector's controls (collect-now, source health) — is reachable only on the owner's own machine, never from other devices on the network, the owner's phone included. Settings exist only as the local file; there is no settings control in the app.
- **Abuse cases:**
  - Hostile content inside a listing (markup or script in a title or description): kept as plain text and never executed or rendered as markup when shown later.
  - An oversized or malformed source response: rejected for that run, nothing closed on its basis, the source flagged.
  - A visitor on the same network: cannot reach the app at all — it cannot connect, rather than being refused, since there is nothing for them there.
  - Repeated collect-now presses: cannot exceed any source's allowed rate (AC-02, AC-16) — protects the owner's address from being blocked by a source.
  - Using collected postings beyond personal use: no export or republishing path exists (source terms).
- **Security review:** Required — size M and a new boundary that ingests untrusted external content on every run.

## 7. Metrics / KPIs

- **Completeness** — baseline: 0 (no collector); target: ≥ 95% of fresh tech postings in a spot check of 20 per enabled source — taken from the board's own site within the owner's configured categories, "fresh" meaning still open and published between that source's freshness target (§6: Jobicy 5 h, Remotive and Himalayas 30 h) and 7 days ago (category drift is tracked by AC-24 and the daily-postings KPI) — are present in job-radar, within 14 days of shipping.
- **Freshness** — baseline: not measured (manual browsing); target: p90 ≤ 5 h from publication time for hourly-allowed sources while the app runs (§6 Freshness, same sample), within 14 days of shipping.
- **Silent failures** — baseline: n/a; target: 0 source outages lasting more than 2 of that source's intervals without a flag in source health, in the first 30 days.
- **False closures** — baseline: n/a; target: 0 of 20 spot-checked closed postings found still open at their source, in the first 30 days.
- **New unique tech postings per day** — baseline: TBD, measured over the first 7 days after shipping (postings from the first fill not counted) (this also answers roadmap D2); target: stays within ±30% of that baseline week over week (a larger drop signals category drift or a broken source).

## 8. Open questions

- [ ] What are We Work Remotely's rate limits, and does its feed state a location restriction? Default now: WWR stays disabled until verified (AC-26). Its terms, API and RSS pages all answered 403 on 2026-10-02 (design and again in implement T12). — owner: Volodymyr Kozlov, due: before We Work Remotely is enabled (re-deferred by implement T12 on 2026-10-02 — the source stays disabled at rate 0, the design absorbs either answer)
- [x] How does each source confirm that a listing is closed? Answered by design (ADR-0004): Remotive — absent from its complete unfiltered read; Himalayas — `expiryDate` passed; Jobicy — absent from an untruncated response while still inside its 7-day window; We Work Remotely — none, ages out only. — owner: Tech Lead, resolved 2026-10-02
- [x] What is Himalayas' actual allowed polling rate given its documented 24-hour cache? Answered by implement T12 (2026-10-02): its API docs state rate limiting without a number and that polling more than once a day brings no benefit — the default stays: every 6 hours, ≤ 4 reads a day, ≤ 20 jobs a read. — owner: Volodymyr Kozlov, resolved 2026-10-02
- [ ] Review round 3 L4 (deferred): the overdue reason counts fill pages sent after a good read as an attempted read, so during a first fill it says "No successful read with items for N h" when no regular read was attempted (`apps/server/src/modules/collector/app/source-health.ts:53`, AC-13). Proposed fix: derive "attempted" from the `run_sources` regular-read outcomes after the good read, not from the ledger timestamp. — owner: Volodymyr Kozlov, due: 2026-10-31
- [ ] Review round 3 L5 (deferred): the `settings_fallback` contract example pairs `any_run_finished: true` with `last_run: null`, a state the server cannot produce (`contracts/openapi.yaml:163,170`, AC-27). Proposed fix: `any_run_finished: false`, or a finished `last_run`. — owner: Volodymyr Kozlov, due: 2026-10-31
- [ ] Review round 3 L6 (deferred): sad Flow 6 (`sad.md:413`) and `data-model.md:243` do not state the re-post conditions — the old item proven gone (not offered in this fetch, and not seen this run, and either already closed, or its stated expiry passed on a non-partial read, or missing from a complete fetch inside the window it covers) and the locations not conflicting (AC-04, AC-05). Review round 6 Q1 (accepted residual): an expired item the same read still offers, or that was seen earlier in the run, is not treated as gone, yet finalize closes it (`domain/merge.ts:118-121` vs `domain/closures.ts:45`). Himalayas' 24 h cache can then leave a second, dead Himalayas listing on the posting. A fix must give the same result in both fetch orders and pin both in an integration test. — owner: Volodymyr Kozlov, due: 2026-10-31
