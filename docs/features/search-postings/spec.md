---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "S"
---

# Spec — search-postings

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** None — only the interview, `CONTEXT.md`, `docs/idea-brief.md`, `docs/roadmap.md` (step 3), `docs/architecture-map.md`, `docs/design-system.md` and the [remote-boards-collector spec](../remote-boards-collector/spec.md).

## 1. Context

The owner — a software engineer in Poland looking for global remote roles — now has job-radar collecting postings from four remote job boards in the background, but cannot see them: the collector shows only counts in source health. To review what is new, the owner still opens each board by hand, scans it, and repeats the same mental filter ("does this mention anything I work with?") on every board. Postings the collector already merged, de-duplicated and kept current sit unused.

Why now: the collector shipped on 2026-10-03 (roadmap step 2) and every later step — match score, remote filter, applied/skipped marks, saved searches (roadmap steps 4–7) — narrows, ranks or marks the list this feature produces. The owner is in an active job search, so each day without a list is a day of browsing boards by hand.

Committed approach — **a skills search over the whole merged collection, newest first.** The owner types skills; job-radar lists every open posting whose title or description mentions at least one of them, newest first by the time the source published it, shows on each posting which skills matched, and names and links every source that lists it. With no skills it lists every open posting — the main screen becomes the owner's feed. The last skills are remembered, postings collected since the owner's previous visit are marked new (so a posting a slower source delivered late is not lost below ones already read), and results come 50 at a time without repeats while collection keeps running. Why this: competitive research (2026-10-04) found no product that searches the owner's own skills across several boards merged into one posting and shows which skills matched — each board searches only itself (Remotive's any/all skills filter, Himalayas' skill pages); the sharpest failure found by the adversarial pass is late arrival — Remotive and Himalayas deliver postings up to 30 h after publication, so a publication-time order alone would bury them below postings the owner already read; and the owner's success test is behavioural: they stop opening the boards by hand (§7).

Traceability: what the list can rely on comes from the collector spec — a posting is closed only on a reliable signal and closed postings are hidden (collector AC-07, AC-08) — here too, except one closed while already on screen, until refresh (AC-16); one role advertised on several boards is one posting that names and links every source (collector AC-04); each source's location restriction is kept exactly as stated, "unknown" when it states nothing (collector AC-21, AC-22); a merged posting carries the earliest publication time among its listings (collector AC-04 note). Owner-facing surface: the app's main screen, which today holds only the source-problem marker (collector AC-13); the marker stays.

## 2. Goals

- The owner reviews new remote postings in job-radar instead of opening the job boards by hand.
- No open posting that mentions one of the owner's skills is silently missing from their list.
- A posting new to the owner is noticeable at a glance, even when its source delivered it late.

## 3. Non-goals

- Ranking by fit, a match score or a "why it fits" note — roadmap step 4; this list is ordered by time only.
- Deciding whether the owner may work from Poland — roadmap step 5 (remote filter); this feature only shows each source's location restriction as stated.
- Applied / skipped marks and hiding postings the owner has dealt with — roadmap step 6.
- Saved searches and notifications — roadmap step 7; this feature remembers only the single last set of skills.
- Skill synonyms and search operators (JS vs JavaScript, AND / NOT, quoted phrases) — the owner enters each spelling they care about; understanding meaning is the match score's job (step 4), and a hand-kept synonym list is upkeep the owner would have to maintain.
- Filtering by source, company, date or location — not requested; skills plus newest-first cover the named pain.
- Showing closed postings or a posting's history — the owner can only apply to open roles (the one exception: a posting closed while it is on screen stays until the list is refreshed, AC-16).

## 4. User stories

### US-01: Search postings by my skills
**As an** owner
**I want** to enter my skills and get the open postings that mention at least one of them, newest first
**So that** I see the roles I could do without opening every board

### US-02: See which skills matched
**As an** owner
**I want** each posting in the list to show which of my skills it mentions, and whether in its title
**So that** I can judge at a glance whether it is worth opening

### US-03: Reach every source to apply
**As an** owner
**I want** each posting to show its title, company, publication time and location restriction, and to name and link every source that lists it
**So that** I can check where I may work from and apply on the board I prefer

### US-04: Browse everything without typing
**As an** owner
**I want** the list with no skills entered to show every open posting, newest first
**So that** the main screen works as my feed of what job-radar has collected

### US-05: Come back to my last search
**As an** owner
**I want** job-radar to remember the skills I searched last
**So that** opening the app shows my list straight away without retyping

### US-06: Notice what is new since my last visit
**As an** owner
**I want** postings collected since my previous visit to be marked new, with their count shown
**So that** I don't miss a role a slower source delivered late, below postings I already read

### US-07: Page through long lists reliably
**As an** owner
**I want** results 50 at a time with the total shown, and more on request, without repeats or gaps while collection runs
**So that** a long list stays fast on my phone and I can trust I have seen all of it

> **Visitor:** no user story — a visitor has no goal this feature serves; the role exists only to be kept out (AC-17, §6.1).

## 5. Acceptance criteria

### AC-01 (US-01) — happy
**Given** the collection holds open postings, some of which mention "React" or "TypeScript" in their title or description
**When** the owner searches for the skills "React, TypeScript"
**Then** the owner sees exactly the open postings that mention at least one of the two skills, newest first, with the number of postings found

### AC-02 (US-01) — domain invariant
**Given** a skill the owner entered
**When** postings are matched against it
**Then** it matches a posting when it is found in the title or description of any of the posting's open listings, and only where its exact text — symbols included, letter case ignored — stands in the title or description with no letter or digit directly before it and no letter, digit, `#` or `+` directly after it: "Go" does not match "Google" or "MongoDB"; "Java" does not match "JavaScript"; "C#" matches "C#" but "C" does not match "C#"; ".NET" matches ".NET" but not "ASP.NET"; "Node.js" matches "Node.js" but not "Node"; "machine learning" matches only that phrase

> Accepted noise: a short skill also matches unrelated words written the same way ("Go" in "go-to-market", "R" in "R&D"); the owner sees which skill matched (AC-06) and can enter a longer spelling ("Golang"). A fixed example list covering every case above is part of the tests.

### AC-03 (US-01) — domain invariant
**Given** two postings are tied on time, one source states a publication time in the future, and another states none
**When** the owner's list is ordered
**Then** postings are ordered newest first by publication time; a publication time later than the moment job-radar first collected the posting counts as that first-collected moment; a posting with no publication time is placed by its first-collected moment and shown as "publication time unknown"; ties keep the same order on every load

### AC-04 (US-01) — cross-context
**Given** the collector has marked a posting closed, and has reopened another one
**When** the owner searches with a skill both postings mention
**Then** the closed posting is not in the list and the reopened one is — the list shows only postings the collector holds open at the moment of the search

### AC-05 (US-01) — error
**Given** the owner enters a skill with no letter or digit (for example "#" or "--"), a skill longer than 50 characters, or more than 20 skills
**When** the owner searches
**Then** the search does not run, the message under the skills field names the skill (or the count) and the rule it breaks, and the list on screen stays as it was

> Skills are separated by commas; spaces inside a skill are kept ("machine learning"); surrounding spaces and empty entries are ignored; the same skill entered twice in different letter case counts once.

### AC-06 (US-02) — happy
**Given** a posting mentions "React" in its title and "TypeScript" only in its description, and the owner searched "React, TypeScript, Go"
**When** the posting is shown in the list
**Then** it shows "React" and "TypeScript" as matched — React marked as found in the title — in the owner's own spelling, and does not show "Go"; on a merged posting a skill counts as found in the title when any open listing's title has it

### AC-07 (US-03) — happy
**Given** an open posting in the list
**When** the owner looks at it
**Then** they see its title, company, publication time (or "publication time unknown" with when it was first seen), its location restriction exactly as each source stated it ("unknown" when a source stated nothing), and the name of every source that lists it, each open listing opening that source's own page for the posting (closed listings per AC-08)

### AC-08 (US-03) — domain invariant
**Given** a posting listed by Jobicy and Himalayas, where Himalayas has confirmed its listing closed but Jobicy still offers it
**When** the posting is shown
**Then** the source of every listing is named — Jobicy with its link, Himalayas marked "closed at Himalayas" without a link — so the source of any text shown is always credited (board terms require attribution), and the posting is never shown without at least one linked open source

### AC-09 (US-03) — domain invariant
**Given** a source's listing carries markup or script in its title or description, or a link that is not an ordinary web address
**When** the posting is shown, including where matched skills are marked
**Then** the text is shown as plain text and never acts as markup, and the source is still named but its link is not clickable

### AC-10 (US-04) — happy
**Given** the skills field is empty
**When** the owner opens the main screen or searches
**Then** they see every open posting, newest first, with the total number of open postings and no matched skills on any posting

### AC-11 (US-01) — error
**Given** the collection holds no open posting that mentions any of the owner's skills — or holds no postings at all yet
**When** the owner searches
**Then** the owner sees that nothing matches, with the skills they used and one action to clear them; when the collection is still empty, the message says the first collection has not brought postings yet and points to source health

### AC-12 (US-01) — error
**Given** the owner searches while job-radar cannot read its collection
**When** the search fails
**Then** the owner sees a plain-language message with a retry action next to the list, their skills stay in the field, and the last list shown stays visible

### AC-13 (US-05) — happy
**Given** the owner last searched for "React, Go" and closed the app
**When** the owner opens the main screen again
**Then** the skills field holds "React, Go" and the list is a fresh search for them; after the owner clears the skills and searches, the next opening starts with an empty field

### AC-14 (US-06) — happy
**Given** the owner's previous visit to the main screen started yesterday at 09:00, and since then the collector added postings — including one published two days ago that a slower source delivered this morning
**When** the owner opens the main screen
**Then** every posting first collected after yesterday 09:00 is marked new — the late one included, in its publication-time position — and the screen shows how many of the listed postings are new

> A visit starts when the owner opens the main screen after more than 30 minutes without it open; searching, paging and refreshing during a visit do not start a new one. "New" counts only postings first collected after the previous visit started — a reopened or updated posting is not new. On the owner's very first visit there is no previous visit, so nothing is marked new.

### AC-15 (US-07) — happy
**Given** a search finds 130 postings
**When** the list is shown and the owner asks for more twice
**Then** they first see the newest 50 with "130 postings", then 100, then all 130, in the same order as one long list would have

### AC-16 (US-07) — domain invariant
**Given** the owner has 50 postings on screen and a collection run adds, merges, reopens or closes postings
**When** the owner asks for more
**Then** no posting already on screen appears again and none that belonged after the last one shown is skipped, except postings the collector closed since the list was loaded; postings collected after the list was loaded are not inserted into it — the owner is told how many new postings are waiting and can refresh the list; a posting the collector closes while it is on screen stays on screen until the list is refreshed

### AC-17 (US-01) — authorization
**Given** a visitor can reach the owner's machine over the network
**When** the visitor tries to search postings or open the main screen
**Then** they cannot — in v1 the whole app is reachable only on the owner's own machine, so another device cannot connect to it at all

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Search response | ≤ 1 s p95 from the owner pressing search (or opening the main screen) to the first 50 postings shown, with 10,000 open postings in the collection and up to 20 skills | integration test against a temporary database seeded with 10,000 postings of realistic description length; p95 over 50 searches |
| Show more | ≤ 1 s p95 from asking for more to the next 50 shown, same collection | same test, measured per page |
| Currency | 100% of postings from collection runs that finished before the search started are present in its results | integration test: finish a run, search, the run's postings are present |
| Match correctness | 100% of the fixed matching examples (AC-02) pass, each in title and in description | unit test over the example list |
| Phone layout | the list is usable at 360 px width with no horizontal scrolling; every action is a target of at least 44×44 px | component test at phone width; design-system touch rule |

## 6.1 Security / privacy

- **Data classification:** internal — public job postings plus the owner's own search input; nothing leaves the owner's machine.
- **Personal data touched:** the owner's last skills and the start time of their previous visit — remembered on the owner's machine only; low sensitivity (what the owner works with).
- **AuthZ/AuthN impact:** none new — no accounts; in v1 the whole app is reachable only on the owner's own machine (AC-17).
- **Abuse cases:**
  - Hostile markup or script inside a listing's title or description: shown as plain text everywhere, including where matched skills are marked (AC-09).
  - A listing link that is not an ordinary web address (for example one that runs script): not clickable; the source stays named (AC-09).
  - Owner input with symbols or pattern-like text ("C++", ".*", "(", "%"): matched literally as text, never interpreted as a search pattern or command (AC-02).
  - Oversized input (thousands of skills, very long text): refused before searching (AC-05).
  - A visitor on the same network: cannot connect to the app at all (AC-17).
- **Security review:** Required, scoped to AC-09 — this is the first screen that shows untrusted source text and links (the collector's review covered ingestion only); how listing text, matched-skill marking and links are shown is checked in review. No new access boundary or personal data beyond the owner's own search input.

## 7. Metrics / KPIs

- **Board-free days** — baseline: 0 days a week (the owner opens the boards by hand daily, idea brief §2); target: ≥ 5 of 7 days a week on which the owner reviews postings only in job-radar, in weeks 2 and 3 after shipping. Measured by the owner's daily one-line log.
- **Silently missing matches** — baseline: n/a; target: 0 postings, over the first 14 days after shipping, that the owner finds on a board, that job-radar has collected and holds open, that mention one of the owner's skills, and that the search did not list. Measured by the owner logging each case.
- **Late arrivals noticed** — baseline: n/a; target: every posting first collected more than 24 h after its publication time in the first 14 days — postings collected before the owner's first visit after shipping excluded, since that visit marks nothing new (AC-14) — is marked new on the owner's next visit. Measured in a spot check: the owner picks 10 such postings from the collection and confirms each was marked new on the visit after it was collected.

## 8. Open questions

None — every question raised in the interview was decided (matching rule, order, empty search, remembered skills, paging, late arrivals, synonyms, symbols).

Deferred at review (2026-10-07, `_review/review-2026-10-07.md`):

- **R6 — Phone layout NFR is not measured automatically.** jsdom can't measure layout, so the 360 px / 44×44 px check is a manual check in ship's verification for now; an automated browser-mode test is deferred. *Manual check done at ship 2026-10-07: no sideways scroll at 360 px, all 47 targets ≥ 44×44 px after a fix to the source link's min width (`2ce46f5`).* Owner: Volodymyr Kozlov, due 2026-10-31.
- **R8 — A failed collection read is not logged.** `search/app/search.ts` turns every read error into a 503 without logging the cause. Owner: Volodymyr Kozlov, due 2026-10-31.
- **R9 — An old waiting count stays after the poll starts failing.** A poll that once returned N keeps "N new postings are waiting" visible after later 410/503 polls (`Home.tsx`). Owner: Volodymyr Kozlov, due 2026-10-31.
- **R10 — A posting stored in the same millisecond as the snapshot is in neither the list nor the waiting count** (`waiting.ts` counts `> loadedAt`). Accepted as rare. Owner: Volodymyr Kozlov, due 2026-10-31.
