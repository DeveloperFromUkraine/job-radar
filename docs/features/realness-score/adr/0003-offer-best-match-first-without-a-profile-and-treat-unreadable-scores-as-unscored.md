---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-16"
feature_size: "S"
ticket: "roadmap step 12 — realness-score"
---

# 0003 — Offer best match first without a profile and treat unreadable scores as unscored

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** Volodymyr Kozlov, with Claude during the design walk

## Context

Today the order switch shows only when a profile exists (`apps/web/src/routes/Home.tsx`), and search falls back to newest first when scores cannot be read (`search/app/search.ts`: `order = best_match && scores.matches ? best_match : newest`). Spec US-04 and AC-05 require realness to lower postings without a profile, without a key, after the scoring cap, and when scoring has a problem. Under today's rules none of these reaches best match first, and newest first never lowers anything (AC-04).

## Decision drivers

- Spec AC-05: "this holds when no profile exists and when scoring has a problem".
- Spec AC-03 / AC-04: newest first stays exactly as search gives it.
- Match-score AC-11: postings without a score come first in best match first.

## Considered options

1. **Show the order switch always; unreadable scores count as no score** — best match first without scores is the unscored block, ordered by penalty; search no longer falls back to newest.
2. **Keep the switch for profiles only** — realness lowers nothing without a profile; AC-05's no-profile case would need a §1 override and a spec change.

## Decision outcome

**Chosen:** option 1. It meets AC-05 as written and makes realness useful from the first day, at the cost of amending match-score AC-11 (wording in SAD §4).

## Consequences

**Positive**
- Realness works before any profile or key exists, and through scoring outages.
- Removes a silent fallback: the owner gets the order they chose.

**Negative**
- "Best match first" without a profile orders by realness only, which may read oddly; `screens` adds a short hint under the switch.
- Changes shipped match-score behaviour, so its tests for the fallback change.

**Neutral**
- Reverting to profile-only is a UI condition plus one line in search.

## Links

- Spec: [[../spec.md]] US-04, AC-05; match-score AC-11
- SAD: [[../sad.md]] §4 (upstream amendments), §11
- Related ADR: [[0001-ship-realness-as-a-new-realness-module-read-by-search-and-told-of-marks-by-tracking]]
