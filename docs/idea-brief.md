---
status: Draft
owner: "Volodymyr Kozlov"
updated_at: "2026-09-29"
depth: "hard"
---

# Idea brief — job-radar

## 1. Raw idea

"I would like to build a AI tool / agent which will search all possible web pages and looking for a specific job send my cv to specific application which i will select"

Clarified by the owner during the interview: "I give it my CV or write the skills I have, and the system goes through all the job platforms on its own, finds the right positions and shows them as a list so I can verify and confirm them — then it or I send the CV there." And: "I want it to work only on request… it should find the new vacancies too, so I'm one of the first to apply, and the search should be global — sitting in Poland, I could work for a company from another country."

## 2. Problem

Job hunting is routine: the owner spends time manually browsing LinkedIn and other platforms to find relevant openings. Finding the jobs is the named pain — not tailoring the CV, not filling application forms. Keyword search is too weak ("ReactJS" also shows up in backend, QA and design postings), and "Remote" is ambiguous: many remote postings are restricted to one country or region, and every posting phrases that differently. Fresh openings matter: the owner wants to be among the first to apply.

## 3. Users

- **Now:** the owner — an engineer based in Poland, actively job hunting, looking for remote roles globally.
- **Later (product):** engineers from Ukraine and Eastern Europe looking for global remote roles "available from my country". US-focused tools (Jobright, Simplify, Teal, LinkedIn's AI match) mostly ignore this segment and its sources.

## 4. Why now

The owner is job hunting right now, and the manual routine costs time every day. That trigger is personal and temporary: once the owner is hired, the motivation for the "then a product" step drops with it.

## 5. Out of scope

- **Automatic CV sending in v1** — every portal has its own form (salary, visa questions); auto-apply is a project the size of search itself. v1 gives a link, the owner applies manually and marks the status.
- **Crawling "the whole internet"** — a fixed, known set of sources, not an open-ended crawl.
- **Live web search on each request** — slow, incomplete, and it misses fresh postings that aren't indexed yet; it contradicts the "be among the first" goal.
- **CV and cover-letter tailoring** — not the named pain.
- **Multi-user product features** (onboarding, accounts, billing) — after the personal version proves its value.

## 6. Risks

- **LinkedIn in v1 (weakest spot).** The owner named "scrapers keep breaking" as the most likely reason the project gets abandoned in 3 months — and then chose to include LinkedIn from day one, the source that blocks automation hardest and can ban the owner's personal account in the middle of a job search. Assumes LinkedIn can be read reliably; false once its anti-automation or layout changes kick in.
- **Source maintenance eats the job search.** Assumes the owner will fix broken sources; false if fixing them takes more time than the manual search it replaced.
- **"Global" pulls back toward "everything".** Assumes more sources means more value; false if most useful postings come from a few sources anyway.
- **No new finds.** Assumes the tool surfaces jobs the owner would miss; false if it returns the same postings as LinkedIn or Djinni alerts — then the only value left is the matching.
- **Remote classification is wrong.** Assumes postings can be reliably sorted into "hires from my country" vs "company in country X"; false for vague wording like "Remote" with no region stated.
- **Motivation ends with the job hunt.** The product plan depends on the owner still caring after being hired.

## 7. Recommendation

Build a background collector plus an on-request filter: the system gathers postings every couple of hours from a fixed set of sources, and when the owner asks (skills or CV, remote mode, country) it instantly returns a list sorted by freshness, each posting with a match score and a short "why it fits". The remote filter supports both modes — "can work from my country" and "company in country X" — and the owner picks. Start the sources with public ATS job boards (Greenhouse, Lever, Ashby) and remote-focused boards with public feeds, which are global and stable. Treat LinkedIn as an optional source that can fail without breaking the system: public job pages only, no login, never from the owner's main account. v1 ends at the list plus a manual "applied / skipped" status.

## 8. Open questions

- Which sources actually carry the owner's relevant jobs? One week of logging where good postings come from settles whether LinkedIn is needed in v1 — owner.
- ~~LinkedIn access: public no-login pages only, or a logged-in session with a separate account? — owner.~~ Decided 2026-09-29: public no-login guest pages only (roadmap step 10).
- How fresh is "among the first": hours or a day? This sets the collection frequency — owner.
- Saved searches with notifications as the step right after v1: yes or no? — owner.
- The later product: is the niche "Eastern European engineers, global remote" real, and would an open list of companies that actually hire from the region be the asset to build it on? — owner.
