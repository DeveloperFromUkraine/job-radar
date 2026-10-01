---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-01"
feature_size: "M"
---

# Spec — remote-boards-collector

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** None — only the interview, `CONTEXT.md`, `docs/idea-brief.md`, `docs/roadmap.md` (step 2, decision D1) and `docs/architecture-map.md`.

## 1. Context

The owner — a software engineer in Poland searching for global remote roles — finds jobs today by opening several remote job boards by hand, one after another. It is slow, easy to forget, and by the time a good role is noticed it may already have hundreds of applicants; the owner wants to be among the first to apply. Nothing in job-radar can help until postings exist inside it: search, match scoring, the remote filter, applied/skipped marks and saved-search alerts (roadmap steps 3–7) all read what this feature collects.

Why now: the project skeleton is built (roadmap step 1), and this is the step every other one waits on. The freshness decision (roadmap D1) is settled — hours, not a day — and the owner is in an active job search, so each week without a collector is a week of manual board browsing.

Committed approach — **a per-source schedule over a shared source contract.** Every enabled source is collected continuously, each at the cadence its own terms allow and that actually yields new data: Jobicy is the freshness source (polled hourly), Himalayas the completeness and location-data source, Remotive adds coverage at its slower allowed rate, and We Work Remotely joins once its terms are verified (§8 Q1) — until then it stays disabled. The same role seen on several boards becomes one posting that names and links every source; a posting is closed only on a reliable signal; and source health is visible so a broken source is never silent. This beat the three pure strategies: the pair-with-failover approach relied on two sources that are structurally 24 hours late (analyst, Executive lens: "misses core ≤2h freshness goal"), the all-sources-hourly mesh breaks Remotive's published limits, and the single-feed approach drops merging and health — the brief's top abandonment risk. The research gap it targets: existing aggregators are stateless per run or single-board; none keeps closed-state, owner marks and source health over time. RICE ≈ 1.05 (reach 1 owner · impact 3 · confidence 70% · effort 2 person-weeks); feasibility Tech ☑ (the skeleton already has a migrated database and a temporary-database test helper), Skills ☑ (the owner's chosen stack; sources publish plain feeds, no page scraping), Time ☑ (1–2 sprints). Size grew from the roadmap's S to M during specify: merging across sources, reliable closing, source health, catch-up and category settings were judged inseparable from a collector the owner can trust (the brief's top abandonment risk); roadmap step 2 is re-sized accordingly.

Traceability: source facts verified 2026-09-29 — Himalayas documents a 24-hour data cache; Remotive's free feed is delayed 24 hours and asks for at most ~4 fetches a day; Jobicy allows polling at most once an hour; We Work Remotely requires attribution, its limits and location data are unconfirmed.

## 2. Goals

- The owner no longer opens job boards by hand to learn what is new — every relevant new remote tech posting from the chosen sources is in job-radar.
- The owner sees new postings shortly after a source makes them available, so they can be among the first to apply.
- A broken or misbehaving source is never silent — the owner learns about it before it costs them postings.

## 3. Non-goals

- Interpreting location restrictions into an eligibility verdict ("can I work from Poland?") — that is the remote filter (roadmap step 5); this feature only keeps what sources state.
- Searching, ranking or scoring postings — roadmap steps 3 and 4 consume what is collected here.
- LinkedIn and company ATS boards — roadmap steps 10 and 9; they plug into the same source contract later.
- Collecting while the owner's machine is off or the app is not running — an always-on host is a later decision (architecture map constraint).
- Republishing, exporting or sharing collected postings — every source's terms forbid it.

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
**Given** a source was read more recently than its terms allow
**When** any collection run starts — scheduled, catch-up or collect-now
**Then** that source is not read again in this run, and its source health shows when it is next due

### AC-03 (US-01) — error
**Given** one enabled source cannot be reached, refuses the request, or returns something that cannot be read
**When** the collection run reads it
**Then** the other sources are still collected, no posting from the failing source is closed, and that source's health shows the failure with a plain-language reason

### AC-04 (US-02) — happy
**Given** a posting from one source is already in the collection
**When** another source offers a listing from the same company with the same role title (ignoring letter case, punctuation and generic "remote" wording) within 7 days of the first
**Then** the owner sees one posting that names and links both sources

### AC-05 (US-02) — domain invariant
**Given** the same company advertises two roles whose titles differ in anything beyond letter case, punctuation and generic "remote" wording — for example different regions or teams
**When** both listings are collected
**Then** they stay two separate postings, each with its own location restriction and link

### AC-06 (US-02) — cross-context
**Given** the owner has marked a posting as skipped
**When** a listing from another source is merged into that posting
**Then** the posting stays marked skipped and is not presented to the owner as new

### AC-07 (US-03) — happy
**Given** every source listing a posting has confirmed it is no longer open
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
**Given** a posting has been closed or unseen by any source for more than 60 days
**When** clean-up runs
**Then** the posting is removed if the owner never marked it, and kept if the owner marked it applied or skipped

### AC-11 (US-03) — happy
**Given** a closed posting has not been removed yet
**When** one of its sources offers the same listing again
**Then** the same posting reopens with the owner's earlier marks, instead of a new unmarked copy appearing

### AC-12 (US-04) — happy
**Given** at least one collection run has finished
**When** the owner opens source health
**Then** they see for each source when it last succeeded, how many postings its last run added, updated and closed, and when it is next due

### AC-13 (US-04) — error
**Given** a source has failed on two consecutive due runs, returned nothing on two consecutive due runs, or has not been read for more than twice its interval while the app was running
**When** the owner looks at source health
**Then** that source is flagged with a plain-language reason

### AC-14 (US-04) — domain invariant
**Given** a single run of one source would close more than 30% of that source's open postings
**When** the collection run finishes
**Then** those closures are held back (the postings stay open), and the source is flagged as possibly changed so the owner can check it

### AC-15 (US-05) — happy
**Given** no collection run is in progress
**When** the owner asks to collect now
**Then** a run starts for every enabled source that its terms allow reading now, the owner sees it in progress, and then sees each source's outcome

### AC-16 (US-05) — domain invariant
**Given** a collection run is already in progress
**When** the owner asks to collect now
**Then** no second run starts and the owner is told a run is already in progress

### AC-17 (US-05) — authorization
**Given** a visitor can reach the owner's machine over the network
**When** the visitor tries to start a collection or view source health
**Then** they cannot — the collector's controls and data are available only on the owner's own machine, so another device on the same network sees nothing to use

### AC-18 (US-06) — happy
**Given** the last successful collection is older than a source's interval
**When** the app starts
**Then** a catch-up run for the due sources begins within one minute of the start

### AC-19 (US-06) — happy
**Given** the app has never collected before
**When** it starts for the first time
**Then** it collects whatever each source offers from the last 30 days, and the owner sees the first postings without waiting for the schedule

### AC-20 (US-06) — error
**Given** a collection run was interrupted — the laptop slept or the app stopped mid-run
**When** the app starts again
**Then** the interrupted run is recorded as incomplete, nothing is closed on its basis, it does not count as the last successful collection, and new runs are not blocked by it

### AC-21 (US-07) — happy
**Given** a source states where candidates may work from — as countries, regions, time zones or free text
**When** its listing is collected
**Then** the posting keeps that statement exactly as the source gave it, named after the source

### AC-22 (US-07) — domain invariant
**Given** a source states nothing about where candidates may work from
**When** its listing is collected
**Then** the posting's location restriction is recorded as unknown, never as "anywhere"

### AC-23 (US-08) — happy
**Given** the owner's tech category list, kept in their settings file, does not include a source's category
**When** that source offers a listing in it
**Then** the listing is not collected

### AC-24 (US-08) — error
**Given** the owner's tech category list names a category the source no longer offers
**When** the source is collected
**Then** source health tells the owner that this category matched nothing at the source, so they can update the list

### AC-25 (US-04) — domain invariant
**Given** in a single run more than half of a source's new listings have an unknown location restriction, and that share is at least twice the source's average share over the previous 7 days
**When** the collection run finishes
**Then** the listings are collected as usual and the source is flagged as possibly changed, with the unusual share named in the reason

### AC-26 (US-08) — happy
**Given** a source is disabled in the owner's settings file
**When** any collection run starts — scheduled, catch-up or collect-now
**Then** that source is not read, its existing postings are neither closed nor removed because of it, and source health shows it as disabled

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Freshness (hourly-allowed sources) | ≤ 2 h from a source making a listing available to the posting being in job-radar, p90, while the app runs | per-posting difference between the source's publication time and first collection time, reported per source |
| Freshness (slower sources) | ≤ the source's documented delay + one allowed interval: Remotive ≤ 30 h, Himalayas ≤ 30 h (24 h cache + the default 6 h interval, §8 Q3); We Work Remotely set when it is enabled (§8 Q1) | same metric, compared with the source's documented delay |
| Source request rate | never above each source's published limit (Jobicy ≤ 1 per hour; Remotive ≤ 4 per day and ≤ 2 per minute; Himalayas ≤ 4 per day until §8 Q3 sets its verified rate; We Work Remotely 0 — not read until §8 Q1 sets its verified limit) | count of reads per source per window, checked in tests and visible in source health |
| Collection run duration | ≤ 5 min p95 for a regular run; ≤ 30 min for the first 30-day fill | run start/finish times recorded per run |
| App start with a catch-up due | the app responds to the owner ≤ 5 s after start, even while catch-up or the first fill runs | start-up smoke test in CI |
| Problem detection | a failing or silent source flagged within 2 of its own intervals | AC-13 / AC-14 / AC-25 tests; time from first failure to flag, from run history |
| Retention bound | unmarked postings closed or unseen by any source for more than 60 days removed on every clean-up | count of unmarked postings closed or unseen for more than 60 days = 0 after clean-up |

## 6.1 Security / privacy

- **Data classification:** internal — public job postings plus the owner's own marks; nothing leaves the owner's machine except requests to the sources.
- **Personal data touched:** none new — source listings contain no applicant data; the owner's applied/skipped marks are introduced by roadmap step 6; this feature only preserves them (see the §5 note).
- **AuthZ/AuthN impact:** no accounts; the collector's controls (collect-now, source health, category settings) are reachable only from the owner's own machine, never from other devices on the network.
- **Abuse cases:**
  - Hostile content inside a listing (markup or script in a title or description): kept as plain text and never executed or rendered as markup when shown later.
  - An oversized or malformed source response: rejected for that run, nothing closed on its basis, the source flagged.
  - A visitor on the same network: cannot reach the collector at all — hidden, not merely refused, since there is nothing for them there.
  - Repeated collect-now presses: cannot exceed any source's allowed rate (AC-02, AC-16) — protects the owner's address from being blocked by a source.
  - Using collected postings beyond personal use: no export or republishing path exists (source terms).
- **Security review:** Required — size M and a new boundary that ingests untrusted external content on every run.

## 7. Metrics / KPIs

- **Completeness** — baseline: 0 (no collector); target: ≥ 95% of fresh tech postings in a spot check of 20 per enabled source — taken from the board's own site within the owner's configured categories (category drift is tracked by AC-24 and the daily-postings KPI) — are present in job-radar, within 14 days of shipping.
- **Freshness** — baseline: not measured (manual browsing); target: p90 ≤ 2 h for hourly-allowed sources while the app runs, within 14 days of shipping.
- **Silent failures** — baseline: n/a; target: 0 source outages lasting more than 2 of that source's intervals without a flag in source health, in the first 30 days.
- **False closures** — baseline: n/a; target: 0 of 20 spot-checked closed postings found still open at their source, in the first 30 days.
- **New unique tech postings per day** — baseline: TBD, measured over the first 7 days after shipping (this also answers roadmap D2); target: stays within ±30% of that baseline week over week (a larger drop signals category drift or a broken source).

## 8. Open questions

- [ ] What are We Work Remotely's rate limits, and does its feed state a location restriction? Default now: WWR stays disabled until verified (AC-26). — owner: Volodymyr Kozlov, due: before `sdd:design`
- [ ] How does each source confirm that a listing is closed (a direct signal, a complete non-capped fetch, or checking the listing's own page)? Default now: a posting closes only on a signal the design names per source; none → it never auto-closes and only ages out after 60 days. — owner: Tech Lead, due: before `sdd:design` completes
- [ ] What is Himalayas' actual allowed polling rate given its documented 24-hour cache? Default now: every 6 hours, ≤ 4 reads a day. — owner: Volodymyr Kozlov, due: before `sdd:design`
