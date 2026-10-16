---
id: T12
title: "Implement matching's score reader and scoring health"
layer: "app"
deps: ["T03", "T05", "T10", "T11"]
blocks: ["T15"]
acs: ["AC-06", "AC-10", "AC-12", "AC-14", "AC-15", "AC-18"]
files_hint: ["apps/server/src/modules/matching/app/score-reader.ts", "apps/server/src/modules/matching/app/health.ts", "apps/server/test/matching-health.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Implement matching's score reader and scoring health

## Place in the sequence

- **Blocked by:** T03 — Write the score rules: total with fixed weights, answer validation, text fingerprint, staleness and the match state, T05 — Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction, T10 — Give search a ScoreReader, the best-match order and a match on every posting, T11 — Export the owner's list from search and show the last score in the marked view · **Blocks:** T15 — Expose matching's routes and wire the module into app.ts · **Wave:** 4.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** every posting without a score to say why, and scoring problems to show where source problems show
> **So that** I never mistake a missing score for a bad fit, and I notice when scoring has stopped
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Answers "what does each posting show?" for search and "how is scoring doing?" for source health.

## Inlined context

> ### Flow 9: scoring health and the main-screen problem marker (AC-12, AC-14, AC-18)
>
> ```mermaid
> sequenceDiagram
>     autonumber
>     actor O as user (owner)
>     participant U as ui (main screen SCR-01, source health SCR-02)
>     participant C as service (collector)
>     participant M as service (matching)
>     participant D as data-store
>
>     Note over O,M: Precondition: the scorer records every outcome and problem (flow 1)
>     O->>U: opens the main screen
>     U->>C: source problems
>     C-->>U: source problems as today
>     U->>M: scoring health
>     M->>D: last success, this month's spend and cap, pending count, oldest pending age, could-not-be-scored count this month, current problem
>     D-->>M: figures
>     M-->>U: scoring health
>     alt provider unreachable, key missing or refused
>         U-->>O: problem marker, leading to source health
>     else cap reached
>         U-->>O: line above the list - scoring cap reached, resumes on the first of next month - and the problem marker
>     else no scoring problem
>         U-->>O: marker only if a source has a problem
>     end
>     opt opens source health
>         O->>U: follows the marker or the navigation
>         U-->>O: scoring health beside the sources - the problem with its reason and when scoring last succeeded, spend against the cap, pending and oldest pending age, could not be scored this month
>     end
>     Note over O,M: Postcondition: cards keep showing not scored with the reason per posting (flow 2), nothing is hidden, and the collector is unchanged
> ```
>
> — `sad.md §6, Flow 9, verbatim` · full text: [sad.md](../sad.md)

> - **F-5 (accepted):** `oldest_pending_since` is the oldest unscored posting's `first_found_at`. A posting that enters the list late (wider skills, filter off) shows its collection time until it is scored. The freshness NFR test measures new postings, so it is exact there. No new column.
>
> — `contracts/api-sync-report.md §Findings, F-5, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> - Scoring health on SCR-02 is the monitor: last success, spend this month against the cap, pending count and the oldest pending age, could-not-be-scored count, current problem; a problem raises the main-screen marker (AC-14).
>
> — `sad.md §7, Monitoring, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Reads `matching_settings` (profile, version, problem, last success, cap), `matching_scores` by posting ids, and the month's spend. No writes.

— `data-model.md §Entities, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`getScoringHealth` → `ScoringHealth { last_success_at, cap_usd_cents, spent_usd_cents, cap_reached, resumes_on, pending_count, oldest_pending_since, could_not_score_count, problem: { kind, reason, since }|null }`; `problem.kind` adds computed `cap_reached`.

— `contracts/openapi.yaml, operationId getScoringHealth, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-06 — cross-context

> **Given** a posting was scored, and later its text changes at its source or a listing from another board merges into it (an updated posting)
> **When** the owner next sees the posting
> **Then** its score stays shown, marked "scored against an earlier version of this posting", until a new score replaces it, and it is scored again in its turn (AC-13); a posting merely seen again unchanged keeps its score and is not scored again
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — happy

> **Given** 60 postings in the owner's list have scores, and the owner changes their seniority from senior to staff and saves the profile
> **When** the owner returns to the list
> **Then** every existing score stays shown, marked "scored against your previous profile", until its posting is scored again; they are scored again newest first within the scoring cap (AC-12), after every posting that has no score at all; and "best match first" uses the new scores from the next time the list is loaded or refreshed (AC-11)
>
> > Only a saved change to a profile field makes scores stale: skills or their core / nice-to-have mark, years, seniority, role types, minimum salary or engagement forms. Saving with nothing changed, or changing the scoring cap, makes nothing stale.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** the scoring cap is $5 and this calendar month's scoring and profile drafting have cost $4.98, counting failed attempts the provider charged for
> **When** the next posting is due for scoring
> **Then** no further scoring or profile drafting is started this month; postings that have no score show "not scored — monthly cap reached", and scores made against an earlier version of a posting or profile stay shown with their mark; the main screen shows that the scoring cap is reached and when scoring resumes (the first day of next month); the list, search, the remote filter and marks keep working unchanged
>
> > Spending is job-radar's own count: the usage the provider reports with each answer, priced at the model's stored price; an attempt that ends without an answer counts at its largest possible cost. The largest possible cost of an attempt is its input and output limits at that price, and no attempt is started unless it fits in what is left of the cap, so the month's spending never exceeds the cap. The month follows the owner's machine time zone, as the grace day does.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** the provider is unreachable, refuses job-radar's key, or no key is set up
> **When** scoring is due
> **Then** postings without a current score show "not scored" with the reason in plain language; scoring health shows the problem with the reason and when scoring last succeeded; the main-screen problem marker shows; nothing is hidden; and scoring picks up by itself, newest first and within the cap: after an unreachable or rate-limited provider, it is tried again at most every 15 minutes; after a missing or refused key, it is tried again when job-radar is restarted with a key
>
> > Timeouts, rate limits, an unreachable provider and key problems are provider problems: the posting stays pending and does not count towards AC-18. The provider key is set only in the owner's local configuration, outside the repository, and never on screen.
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy

> **Given** the owner has not set up a profile
> **When** the owner opens the main screen
> **Then** the list works exactly as before — no scores and no "pending" marks on the cards, newest first — and one line above the list says there are no scores yet because no profile is set up, with one action to set one up, from a CV or by hand
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — error

> **Given** the provider answers for a posting on three consecutive attempts — in the same scoring pass or not — with something that is not a usable score: no number, a number outside 0 to 100, a missing part, a fit note over 40 words, or a refusal to handle the posting's text
> **When** the third answer arrives
> **Then** the posting shows "not scored — could not be scored" with the reason in plain language, stays in the list in its place, and is not tried again until the posting or the profile changes; all three attempts count against the scoring cap; scoring health shows how many postings could not be scored this month
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `app/score-reader.ts`: implements search's `ScoreReader` with `matchState` (T03), the current fingerprints (posting texts via `collector/app/`), the problem and cap-reached; `listRead()` wakes the scorer
- [ ] `app/health.ts`: `getScoringHealth(now)`; `pending_count` / `oldest_pending_since` from `ownerListIds()` (T11) minus current scores (F-5)
- [ ] Plain-language reasons per state; never the key
- [ ] `matching-health.integration.test.ts`: each problem kind, cap reached with `resumes_on`, could-not-score count this month

## Edge cases

| Case | Behaviour |
|---|---|
| Key refused | `problem.kind: key_refused`, reason without the key |
| $4.98 of $5 | `cap_reached: true`, `resumes_on` = first of next month |
| No profile | zeros, `problem: null`; reader `hasProfile` false |
| Posting text changed since scoring | `state: scored`, `stale: posting_changed` |

## Definition of Done

**Done when:** `matching-health.integration.test.ts` passes every edge-case row, and a reader test returns each `Match.state` / `stale` value for AC-06, AC-10, AC-12, AC-14, AC-15 and AC-18.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
