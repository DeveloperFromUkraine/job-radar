---
status: Living
updated_at: "2026-10-02"
---

# Domain Context — job-radar

## Glossary

- Closed posting — a posting that every enabled source listing it has confirmed as no longer open (a disabled source's listing does not count; at least one enabled source must confirm): the source says so directly, or the listing is absent from a complete, successful fetch that should contain it. NOT a posting that merely fell off a capped feed, and NOT one missing after a failed or partial run — those stay open.
- Collection run — one pass that reads every enabled source that is due, started by the schedule, by catch-up on start, or by the owner's collect-now; it records a per-source outcome. NOT a single source's fetch (one run contains one fetch per due source) and NOT the schedule itself.
- Listing — one source's copy of a posting, with that source's link, text and publication time. NOT the posting itself: two listings on two boards can belong to one posting.
- Location restriction — what a source states about where a candidate may work from (countries, regions, time zones or free text), kept exactly as stated. NOT the owner's eligibility verdict (that is the remote filter, a later feature); a source that states nothing is recorded as unknown, never as "anywhere".
- Owner — the one person who runs job-radar on their own machine to find global remote roles for themselves; the only human role in v1. NOT a visitor on the same network (someone who can reach the machine but is not the owner) and NOT a future product user (multi-user is out of scope).
- Posting — one open role at one company as the owner sees it; it may be advertised on several sources. NOT a listing (one source's copy of it).
- Source — an external job board or feed that job-radar reads postings from (e.g. Himalayas, Remotive); each source has its own terms, freshness and failure behaviour, and may be primary or backup. NOT the employer (the company that posted the role) and NOT a listing (one item a source returns).
- Source health — the owner-visible state of one source: when it last succeeded, what the last run brought (new, updated, closed), and whether it looks wrong (failing, silent, unusually many closures, unusually many unknown restrictions, or no run for too long). NOT the collection run's own outcome (a run can succeed while one source in it is unhealthy).
- Updated posting — a posting already in the collection whose title, text, location restriction or link changed at one of its sources (the latest statement replaces the stored one), that gained a listing from another source, or that reopened. NOT a newly added posting (collected for the first time) and NOT a posting merely seen again unchanged.
- Visitor — anyone who can reach the owner's machine over a network but is not the owner. NOT the owner, even when on the same Wi-Fi or device family.

## Invariants

- A failed or partial fetch can never close a posting.
- At most one collection run is in progress at any time.
- One source failing never stops the other sources in the same collection run.
- Every listing keeps its source's name and link — board terms require attribution.
- The owner's applied / skipped marks belong to the posting and survive its closing.

## Out of scope

- Other job seekers as users — the multi-user product gets its own roadmap once the personal version proves its value.
