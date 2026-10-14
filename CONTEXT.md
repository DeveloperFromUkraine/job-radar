---
status: Living
updated_at: "2026-10-14"
---

# Domain Context — job-radar

## Glossary

- Closed posting — a posting that every enabled source listing it has confirmed as no longer open (a disabled source's listing does not count; at least one enabled source must confirm): the source says so directly, or the listing is absent from a complete, successful fetch that should contain it. NOT a posting that merely fell off a capped feed, and NOT one missing after a failed or partial run — those stay open.
- Collection run — one pass that reads every enabled source that is due, started by the schedule, by catch-up on start, or by the owner's collect-now; it records a per-source outcome. NOT a single source's fetch (one run contains one fetch per due source) and NOT the schedule itself.
- Grace day — after a posting loses its applied mark (cleared or changed to skipped), it stays protected from clean-up until the end of the next calendar day in the owner's time zone, so the owner can mark it applied again. NOT the collector's 60-day retention (which counts from closing or the last offer) and NOT an undo window (the Undo notice lasts 8 seconds).
- Applied — the mark the owner sets when they have applied to a posting's role; a posting marked applied is kept for good, even after it closes. NOT a reply or confirmation from the employer.
- Listing — one source's copy of a posting, with that source's link, text and publication time. NOT the posting itself: two listings on two boards can belong to one posting.
- Location verdict — the remote filter's decision for one posting and one country: fits (some open listing's stated location includes the country — open meaning still offered by an enabled source; an "Anywhere" is set aside when another open listing states anything at all), check (nothing stated, wording it cannot read, an exception, or only working hours fit — shown with a mark, never hidden) or not open (every open listing states a readable location that leaves the country out — hidden); the posting takes the best verdict among its open listings. NOT the location restriction itself (what the source said) and NOT a match score.
- Look-alike posting — an unmarked open posting from the same company as a posting the owner marked, whose company and title match it by the collector's merge matching (plus bracketed parts other than regions ignored and Sr/Jr read as Senior/Junior), that the collector did not merge into the marked one (for example a re-post more than 7 days later or with a reworded title); it is shown with a hint about the earlier mark and is never hidden because of that mark (the remote filter can still hide it for its location). NOT a merged posting (one posting, many listings) and NOT a reopened posting.
- Mark — the owner's decision on a posting: applied or skipped, at most one per posting; it belongs to the posting, so it survives merging, closing and reopening, and a marked posting leaves the owner's list. NOT a source's open or closed state and NOT the "new" flag (which only says when the posting was first collected).
- Marked postings (marked view) — the view behind the "Show marked postings" switch on the main screen: only marked postings, closed ones included, plus closed postings whose mark was cleared and that clean-up has not removed yet, most recently marked first. NOT the main list (which holds only unmarked open postings) and NOT a history of marks (only the current mark is kept).
- Location restriction — what a source states about where a candidate may work from (countries, regions, time zones or free text), kept exactly as stated. NOT the owner's location verdict (the remote filter's reading of it); a source that states nothing is recorded as unknown, never as "anywhere" — but a source that explicitly says only "Anywhere" or "Anywhere in the World" is kept as stated and read by the remote filter as Worldwide (for merging it still counts as stating nothing).
- Owner — the one person who runs job-radar on their own machine to find global remote roles for themselves; the only human role in v1. NOT a visitor on the same network (someone who can reach the machine but is not the owner) and NOT a future product user (multi-user is out of scope).
- Posting — one open role at one company as the owner sees it; it may be advertised on several sources. NOT a listing (one source's copy of it).
- Skill — a word or short phrase the owner enters to say what they can work with (a language, framework, tool or practice, e.g. React, C#, Kubernetes), used to narrow the open postings they see. NOT a source's job category (categories decide what the collector keeps; skills decide what the owner sees) and NOT a match score (how well a posting fits — roadmap step 4).
- Skipped — the mark the owner sets when they decide not to apply to a posting; it hides the posting from their list, but unlike applied it does not protect the posting from clean-up: a skipped posting is removed by the collector's 60-day rule exactly like an unmarked one. NOT a deletion and NOT a block on the company (other postings from that company still show).
- Source — an external job board or feed that job-radar reads postings from (e.g. Himalayas, Remotive); each source has its own terms, freshness and failure behaviour, and may be primary or backup. NOT the employer (the company that posted the role) and NOT a listing (one item a source returns).
- Source health — the owner-visible state of one source: when it last succeeded, what the last run brought (new, updated, closed), and whether it looks wrong (failing, silent, unusually many closures, unusually many unknown restrictions, or no run for too long). NOT the collection run's own outcome (a run can succeed while one source in it is unhealthy).
- Updated posting — a posting already in the collection whose title, text, location restriction or link changed at one of its sources (the latest statement replaces the stored one), that gained a listing from another source, or that reopened. NOT a newly added posting (collected for the first time) and NOT a posting merely seen again unchanged.
- Visitor — anyone who can reach the owner's machine over a network but is not the owner. NOT the owner, even when on the same Wi-Fi or device family.

## Invariants

- A failed or partial fetch can never close a posting.
- At most one collection run is in progress at any time.
- One source failing never stops the other sources in the same collection run.
- Every listing keeps its source's name and link — board terms require attribution.
- The owner's applied / skipped marks belong to the posting and survive its merging, closing and reopening; an applied posting is kept for good, while a skipped one is removed by clean-up like an unmarked posting.

## Out of scope

- Other job seekers as users — the multi-user product gets its own roadmap once the personal version proves its value.
