---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-16"
feature_size: "S"
ticket: "roadmap step 12 — realness-score"
---

# 0001 — Ship realness as a new realness module, read by search and told of marks by tracking

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** Volodymyr Kozlov, with Claude during the design walk

## Context

Realness has rules (four signals and a capped penalty), one owner setting (the on/off switch), and two kinds of records kept for the spec §7 checks: the penalty and signals at the moment of a mark (AC-14), and a daily share of lowered postings. Search needs the penalty to order the list, and tracking must report every mark change so the record can be kept. Search already imports `tracking/app`. The surfaces are the existing server and the existing SPA (`target_surfaces: [backend-service, web-frontend]`); the SPA gains a switch and a reason line on SCR-01 and no new screen.

## Decision drivers

- Project ADR 0002: feature modules mirror roadmap steps, and a module reaches another only through its `app/` exports.
- No import cycle: search → tracking already exists, and the repost rule needs tracking's look-alike key.
- Spec §8 Q4: company boards (roadmap step 9) may add a fifth signal, which should land in the same place.
- AC-14: the mark record must be kept whenever a mark changes, whatever screen the mark came from.

## Considered options

1. **New `realness` module** — owns the rules, the switch, the mark records and the daily share; search imports `realness/app`; tracking calls an `onMarkChanged` hook wired in `app.ts`.
2. **Inside search** — rules in `search/domain/realness.ts`, the switch as a column of `search_state`; tracking would have to reach search for AC-14 while search already reaches tracking, so the two would be wired to each other at the composition root.

## Decision outcome

**Chosen:** option 1. It follows the one-step-one-module convention, keeps search's ordering change to a penalty it reads, and breaks the only cycle — tracking → realness → tracking — with one injected hook, the same composition-root pattern match-score ADR-0004 uses.

## Consequences

**Positive**
- Rules are testable without a database; the switch, records and shares have one owner.
- Step 9's fifth signal is a change inside `realness/domain`.

**Negative**
- One more module to register in `app.ts`, and one injected hook in tracking's deps.
- Realness depends on two other modules' `app/` exports (collector, tracking).

**Neutral**
- Folding realness into search later is a file move plus the hook; no table changes owner except the switch.

## Links

- Spec: [[../spec.md]] US-01 – US-05, AC-14
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-work-out-realness-signals-when-search-builds-a-snapshot]]
