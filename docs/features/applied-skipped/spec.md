---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "S"
---

# Spec — applied-skipped

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** None beyond the interview, `CONTEXT.md`, `docs/idea-brief.md`, `docs/roadmap.md` (step 6), the [remote-boards-collector spec](../remote-boards-collector/spec.md) and its [ADR-0006](../remote-boards-collector/adr/0006-keep-owner-marks-behind-a-port-the-collector-consults-before-removal.md), and the [search-postings spec](../search-postings/spec.md).

## 1. Context

The owner, a software engineer in an active global remote job search, now reviews postings in job-radar's main list instead of opening each board by hand (search-postings, shipped 2026-10-07). However, nothing in the list records what they have already dealt with. A posting they applied to on Monday or decided against on Tuesday is still in the list on Wednesday, between the postings they haven't read. So every visit they re-read postings they already decided on, and they risk applying twice to the same role.

Why now: search made the list the owner's daily feed, so re-reviewing decided postings is now a cost on every visit. It is roadmap step 6 ("so it doesn't come back"), in wave 4 alongside steps 4, 5 and 10. The collector already keeps a posting's identity through merging, closing and reopening, and already consults a marks port before removing anything (collector ADR-0006), with its mark-related criteria (collector AC-06, AC-07, AC-10, AC-11) verified so far only against test data. This feature supplies the real marks.

Committed approach: **a hard inbox filter with a safety net.** On any posting the owner can mark it applied or skipped, and either mark takes it out of the main list, which then holds only postings the owner hasn't decided on. The mark belongs to the posting, so it holds when another board's listing is merged in, when the posting closes or reopens, and when job-radar restarts. A few-second Undo right after marking, plus a "Show marked postings" view that lists only marked postings, closed ones included, let the owner fix a mis-click or change their mind later. A posting the collector did not merge, but which looks like a marked one (same company, very similar title), carries a hint about the earlier mark and is never hidden by a guess. Why this approach:
- Competitive research (2026-10-07) found no board or tracker whose marks work as a hard filter across boards and over time. LinkedIn's dismiss is soft, and dismissed jobs reappear greyed out; Indeed's applied mark covers only jobs it hosts; trackers such as Huntr only record and never filter the list being browsed.
- The adversarial pass found the sharpest failure: a re-post the collector does not merge (a monthly bump, or a reworded title) comes back as a new, unmarked "new" posting and invites a double application. The look-alike hint answers it without hiding anything by a guess.
- The owner's success test is behavioural: they never have to re-review a posting they already decided on (§7).

Traceability: this spec changes these rules in the two shipped specs.
- Collector AC-10 and its §6 Retention bound: a skipped posting is now removed by clean-up exactly like an unmarked one; only an applied posting is protected, and it is kept for good (AC-09). A posting that loses its applied mark is also kept until the end of the next calendar day (AC-07). CONTEXT invariant updated 2026-10-07.
- Search AC-01, AC-10 and the Currency NFR: "every open posting" and "exactly the open postings that mention…" now mean every *unmarked* open posting (AC-01, AC-12).
- Search AC-11: a list empty only because of marks says so (AC-13).
- Search AC-14 and AC-16: marked postings leave the counts and later pages (AC-12).
- Search §3 Non-goal "Showing closed postings" and AC-08's rule that a posting is never shown without a linked open source now cover the main list only. The marked view shows closed postings with their sources named and links only for listings still open (AC-05).
- Size: classified S (1–2 PRs, about 1–2 days) although the feature has all three of the size matrix's new-module / new-API / migration signals. search-postings had the same three and shipped as S. Roadmap step 6 is re-sized from XS to S.

Collector AC-06, AC-07 and AC-11 are re-verified here with real marks (AC-08).

## 2. Goals

- The owner never has to re-review a posting they already applied to or skipped.
- A mis-click or change of mind never silently loses a posting: every mark can be undone at once or found and changed later.
- The owner is warned before applying twice to a role a board re-posted under a new posting.

## 3. Non-goals

- **Application tracking beyond the mark and its date** (stages, notes, interviews, reminders). The idea brief ends v1 at a manual applied / skipped status; a tracker is a separate product.
- **Hiding look-alike postings automatically.** A guess would hide a company's genuinely different second opening, which breaks search's goal that no matching posting goes missing silently.
- **Blocking a whole company.** A skip is about one role; other postings from the same company stay visible.
- **Marking several postings at once.** One owner reviewing tens of postings a day doesn't need bulk actions, and they would multiply the mis-click risk.
- **Remembering a skip after clean-up removes the posting.** A skipped posting that clean-up removed (AC-09) and a board later re-posts comes back unmarked, with no hint, because the marked posting is gone. Keeping every skip forever would make storage grow without bound, the growth collector ADR-0006 rejected.
- **Changing how the collector merges postings.** The merge rules (collector AC-04, AC-11) stay as they are; unmerged re-posts are handled by the hint.

## 4. User stories

### US-01: Mark a posting applied
**As an** owner
**I want** to mark a posting applied after I apply to it
**So that** it leaves my list and I never review it again

### US-02: Mark a posting skipped
**As an** owner
**I want** to mark a posting skipped when I decide not to apply
**So that** it leaves my list and I never review it again

### US-03: Undo a mark right away
**As an** owner
**I want** to undo a mark in the moment after I set it
**So that** a mis-click doesn't hide a posting I wanted

### US-04: Review and change my marks
**As an** owner
**I want** to see the postings I marked, including closed ones, and change or clear a mark
**So that** I can find a role I applied to when a recruiter replies, and fix a decision I regret

### US-05: Keep marks through collection changes
**As an** owner
**I want** my marks to hold when boards merge, close, reopen or re-list a posting, and when job-radar restarts
**So that** a decided posting doesn't come back on its own

### US-06: Be warned about look-alike re-posts
**As an** owner
**I want** a posting that looks like one I already marked to say so
**So that** I don't apply twice to the same role

### US-07: Trust the list while I mark
**As an** owner
**I want** the counts, the next pages and the empty state to account for my marks
**So that** what the list tells me matches what I see

> **Visitor:** no user story. A visitor is kept out of marking entirely (AC-16), as in both upstream specs.

## 5. Acceptance criteria

### AC-01 (US-01) — happy
**Given** an open posting is in the owner's list
**When** the owner marks it applied
**Then** it leaves the list at once and the number of postings shown drops by one, a notice says "Marked applied" with an Undo action, and the posting does not appear in the owner's list again (on later pages, on the next search or visit, or after job-radar restarts) unless the owner clears or undoes the mark

### AC-02 (US-02) — happy
**Given** an open posting from a company with other open postings is in the owner's list
**When** the owner marks it skipped
**Then** it leaves the list exactly as an applied posting does (AC-01), with the notice "Marked skipped" and Undo, and the company's other postings stay in the list

### AC-03 (US-03) — happy
**Given** the owner has just marked a posting, changed its mark or cleared it, and the notice with Undo is showing (it shows for 8 seconds and closes sooner when the owner marks or changes another posting, searches, turns the marked postings on or off, or reloads; once it closes, Undo is no longer offered and the mark is changed from the marked postings)
**When** the owner presses Undo
**Then** the posting returns exactly to its earlier state (unmarked, or its previous mark with that mark's original date) and to its place in the list, the count is restored, and the posting keeps its "new" flag if it had one

### AC-04 (US-03) — domain invariant
**Given** the owner set a mark in one window, and since then that posting's mark was changed or cleared from any window, even back to the same mark
**When** the owner presses Undo in the first window
**Then** the mark is not reverted, because an undo only reverses a mark that nothing has changed since, and the owner is told the mark changed elsewhere and can see the current mark in the marked postings

### AC-05 (US-04) — happy
**Given** the owner has marked postings, some of which have since closed, and has cleared the marks of some closed postings (AC-07)
**When** the owner turns on "Show marked postings"
**Then** the list shows only marked postings, most recently marked first, each with its mark and the date it was set, and with the number of marked postings. Closed postings whose mark the owner cleared and that clean-up has not yet removed are shown too, labelled "Cleared, removed after <date>" with the applied and skipped actions, and counted separately ("and N cleared"). The owner's skills narrow the view as they narrow the main list. A closed posting is labelled "Closed" and names every source, with links only for listings still open. The order and the pages are fixed when the view loads, as for the main list (AC-12): a card whose mark the owner changes stays in place until the view is refreshed, and later pages never repeat or skip a posting. The switch starts off on every visit, and turning it off returns to the unmarked list.

### AC-06 (US-04) — happy
**Given** a posting is shown in the marked postings
**When** the owner changes its mark (applied to skipped or back) or clears it
**Then** a changed mark replaces the old one (a posting has at most one mark) and the date updates. A cleared open posting returns to the main list and its counts in its publication-time position, and it counts as new only by the rule for new postings (first collected after the previous visit started), never because its mark was cleared. A cleared closed posting stays in the marked postings as AC-05 and AC-07 describe.

### AC-07 (US-04) — domain invariant
**Given** a posting marked applied that clean-up would remove if it were not applied (it is past the collector's 60-day rule, AC-09)
**When** the owner clears its mark or changes it to skipped
**Then** before the change, the owner is told that without the applied mark the posting will be removed at clean-up. Once changed, it is kept until the end of the next calendar day (its grace day), and the owner can mark it applied again until then. Every closed posting whose mark the owner cleared, whatever its age, stays in the marked postings labelled "Cleared, removed after <the date clean-up will remove it>" until it is removed, and the owner can mark it again there. If a source offers the posting again, it is no longer due for removal and keeps its place by the normal rules.

### AC-08 (US-05) — cross-context
**Given** the owner has marked a posting applied or skipped
**When** the collector merges another source's listing into it, closes it, reopens it, or updates its text, or job-radar restarts
**Then** the posting keeps its mark and its first-collected time, never re-enters the owner's list, and is not counted as new

### AC-09 (US-05) — cross-context
**Given** one skipped and one applied posting are each past the collector's 60-day clean-up limit (more than 60 days since closing, or since any enabled source last offered it, with days when all its sources were disabled not counted)
**When** the collector's daily clean-up runs
**Then** the skipped posting is removed exactly as an unmarked one would be, and the applied posting is kept for good, whatever its age

### AC-10 (US-06) — happy
**Given** the owner marked a posting at "Acme Inc" titled "Sr. Backend Engineer (Go) – Remote" applied on 3 October, and 8 days after its latest publication time the collector adds a separate open posting from "ACME" titled "Senior Backend Engineer"
**When** the new posting is shown in the owner's list
**Then** it carries the hint "You applied to a similar posting at Acme on 3 Oct", and the hint names the earlier mark (applied or skipped) and the date it was set. Two postings are similar when their company and title match the way the collector matches them when merging (collector AC-04 note: letter case, punctuation, generic "remote" wording and legal suffixes ignored) and, beyond that, any bracketed part of the title other than a region name is ignored and "Sr" is read as "Senior" and "Jr" as "Junior". Publication times and location restrictions are not compared. When several marked postings match, the hint names an applied one if there is one, otherwise the most recently set skipped mark. Any marked posting job-radar still holds can be the match, closed ones included; a posting whose mark was cleared is unmarked and gives no hint.

### AC-11 (US-06) — domain invariant
**Given** a look-alike posting carries a hint about a marked one
**When** the owner's list is built
**Then** the look-alike is never hidden and never inherits the mark; it stays in the list and counts until the owner marks it; and a posting from the same company with a different title carries no hint

### AC-12 (US-07) — domain invariant
**Given** the owner has 50 postings on screen and, since the list was loaded, has marked some of them, or marks were set or cleared in another window
**When** the owner asks for more, or a waiting count is shown
**Then** marks are checked as each page loads: a later page leaves out postings marked since the list was loaded and includes postings whose mark was cleared since, in their publication-time position, and no unmarked posting that belonged after the last one shown is skipped. Cards marked in another window stay on screen, and this window's counts do not change, until the owner refreshes or searches (as search AC-16 does for a posting that closes while on screen). The count of postings and the count of new postings drop as the owner marks postings in this window, and the number of new postings waiting counts only unmarked ones.

### AC-13 (US-07) — error
**Given** no unmarked open posting matches the owner's skills (or no unmarked open posting exists, with no skills), and at least one matching open posting is marked
**When** the owner searches or opens the main screen
**Then** the owner sees that nothing is left to review, with how many matching open postings they have marked and one action to show the marked postings, instead of the "nothing matches" or "first collection has not brought postings yet" message. When no open posting matches at all, marked or not, search AC-11's messages apply unchanged.

### AC-14 (US-01) — error
**Given** job-radar cannot save marks at the moment
**When** the owner marks a posting, presses Undo, changes a mark or clears it
**Then** the screen keeps its earlier state, the owner sees a plain-language message with a retry action, and nothing is shown that was not saved

### AC-15 (US-04) — error
**Given** a posting on screen was removed by clean-up after the list was loaded
**When** the owner marks it or changes its mark
**Then** the owner is told the posting is no longer in job-radar, and its card leaves the list without any mark being recorded

### AC-16 (US-01) — authorization
**Given** a visitor can reach the owner's machine over the network, or the owner opens a web page from another site in the same browser
**When** the visitor or that page tries to mark, change or clear a mark on any posting
**Then** it cannot. Only the owner's own job-radar screen on the owner's machine can change marks, so nobody else can hide postings from the owner or alter their record of applications.

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Mark response | ≤ 300 ms p95 from the owner pressing applied / skipped to the posting leaving the list | integration test over 100 marks against a collection of 10,000 open postings |
| Search with marks | the search-postings targets (≤ 1 s p95 first page and next page) still hold with 10,000 open postings and 5,000 marked postings | the search NFR test, re-run with 5,000 marked postings seeded |
| Marked view | ≤ 1 s p95 to show the first 50 marked postings, with 5,000 marked postings (about 60 days of skips plus every applied posting) and up to 20 skills | integration test against a seeded collection; p95 over 50 loads |
| Durability | 100% of marks confirmed to the owner survive a restart; a mark is confirmed only once saved | integration test: mark, restart, reload; failure path per AC-14 |
| Phone layout | the applied and skipped actions are each at least 44×44 px and at least 8 px apart; the marked view is usable at 360 px with no horizontal scrolling | browser check at 360 px (manual at ship until spec search-postings §8 R6 is automated) |
| Undo window | the Undo notice shows for 8 s, and closes sooner on the next mark, search, switch of the marked postings or reload | component test with a controlled clock |

## 6.1 Security / privacy

- **Data classification:** internal. Public job postings plus the owner's own decisions about them; nothing leaves the owner's machine.
- **Personal data touched:** for each marked posting, the mark (applied or skipped) and when it was set. This is the owner's job-search activity: which companies they applied to. Moderate sensitivity, since it could reveal to an employer that the owner is job-hunting. Stored on the owner's machine only.
- **AuthZ/AuthN impact:** no new access boundary. Marks change only through the app's existing loopback, same-origin rule (collector ADR-0007), and no new kind of caller is introduced (AC-16).
- **Abuse cases:**
  - A visitor on the same network tries to mark postings: they cannot connect to the app at all (AC-16).
  - A web page from another site tries to mark or clear postings in the owner's browser: refused, so no outside page can hide postings or alter the application record (AC-16).
  - A forged or stale posting reference, such as a removed or invented posting: refused with a plain message, and nothing is recorded (AC-15).
  - Hostile text in a title or company name shown in the look-alike hint: shown as plain text, as in search AC-09.
- **Security review:** N/A. No new access boundary or caller type, and the only new personal data is the owner's own marks, kept on their machine. The mark-changing actions sit behind the access rule already reviewed for the collector (ADR-0007).

## 7. Metrics / KPIs

- **Decided postings that come back**: postings the owner had marked that reappear unmarked in the normal list. Baseline: not measurable (no marks exist). Target: 0 in the first 2 weeks of use, measured by the owner's log of "I've already seen this one" moments and by a test over every collector event (merge, close, reopen, update, restart, clean-up).
- **Double applications prevented**: look-alike postings shown with an "applied" hint that the owner then skips, rather than applying again. Baseline: 0. Target: every look-alike of an applied posting carries the hint, 100% in the AC-10 example set; usage counted from the owner's own log over the first 4 weeks; the app records nothing extra.
- **Mis-click rate**: share of marks undone or cleared within a day. Baseline: not measurable. Target: under 10% after 2 weeks, measured from the owner's own two-week log (the app keeps no history of marks). Higher means the actions sit too close or the Undo notice is missed, and the layout should be revisited.
- **Inbox reach**: share of visits that end with no posting left to review (AC-13 state). Baseline: 0 (no marks). Target: at least 1 visit in 3 within the first 2 weeks, showing the list works as an inbox; measured from the owner's own log.

## 8. Open questions

- [ ] Should the look-alike rule also catch titles that differ by more than punctuation, brackets and Sr/Jr, for example a word added or dropped? Default now: no; the AC-10 rule only, tuned against two weeks of real look-alikes. — owner: Volodymyr Kozlov, due: 2026-10-31
- [ ] Should Undo cover more than the most recent mark? A quick double tap can mark two postings while the notice covers only the second. Default now: the latest mark only; earlier ones are fixed from the marked postings. — owner: Volodymyr Kozlov, due: before sdd:screens
- [ ] Should a skip lift on its own when the posting changes materially, for example a new listing adds a location the owner can work from? Default now: no; a skip holds until the owner clears it (collector AC-06, AC-11). — owner: Volodymyr Kozlov, due: 2026-10-31
- [ ] Restoring a pre-migration database backup drops marks set after the backup. Should the changelog only warn about this, or should marks be exportable? Default now: warn in the changelog. — owner: Volodymyr Kozlov, due: before sdd:ship
