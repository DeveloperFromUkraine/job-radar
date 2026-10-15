---
id: T14
title: "Run the background scorer: polling, wake-ups, queue order, retry cadence, start and stop"
layer: "app"
deps: ["T11", "T13"]
blocks: ["T15"]
acs: ["AC-06", "AC-10", "AC-13", "AC-14", "AC-21"]
files_hint: ["apps/server/src/modules/matching/app/scorer.ts", "apps/server/test/matching-scorer.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T14 — Run the background scorer: polling, wake-ups, queue order, retry cadence, start and stop

## Place in the sequence

- **Blocked by:** T11 — Export the owner's list from search and show the last score in the marked view, T13 — Implement one scoring attempt: reserve, ask, validate, store or strike, settle · **Blocks:** T15 — Expose matching's routes and wire the module into app.ts · **Wave:** 4.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** scoring to stop at a monthly cap I can see
> **So that** job-radar never costs me more than I agreed to
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** every posting without a score to say why, and scoring problems to show where source problems show
> **So that** I never mistake a missing score for a bad fit, and I notice when scoring has stopped
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Keeps the owner's list scored, newest first, within the cap, and picks up by itself after a problem.

## Inlined context

> Layered, as every module in the repo (project ADR 0002): `domain/` holds pure rules with no I/O, `app/` the use cases and the exports other modules may call, `infra/` the tables, the Claude client and the CV reader, `ports/` the routes. `matching` reads postings through `collector/app/` and the owner's list through a new `search/app/` export; search reads scores through a `ScoreReader` that `app.ts` wires in (ADR-0004). The scorer finds its work by polling: every 60 s (the collector scheduler's interval) it reads the owner's list and the score fingerprints and picks the next posting, and matching wakes it at once after a profile save, a cap change or a new search — no collector event is needed. Scoring health is matching's own; the web shows the main-screen problem marker when either the collector's problems or matching's scoring health report a problem, so the collector is unchanged.
>
> — `sad.md §5, Building blocks intro, verbatim` · full text: [sad.md](../sad.md)

> - Background work runs in the server process, as the collector's scheduler does: started on the server's ready hook, stopped through an abort signal on close, in-flight work awaited (`collector/index.ts`, collector ADR-0002).
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

> ### Flow 7: a scored posting changes, its score goes stale and is redone (AC-06, AC-18; ADR-0005)
>
> ```mermaid
> sequenceDiagram
>     autonumber
>     participant C as service (collector)
>     participant SC as service (matching scorer)
>     participant D as data-store
>     participant X as external-system (LLM provider)
>
>     Note over C,D: Trigger: a collection run finds the posting's text changed at its source, or a listing from another board merges into it
>     C->>D: update the posting or attach the merged listing
>     Note over C,D: persists the posting as today - the collector is unchanged and sends no event
>     Note over SC: next wake, every 60 s (flow 1)
>     SC->>D: the posting's score with its text fingerprint and profile version
>     SC->>SC: fingerprint the posting's current text
>     alt fingerprint and profile version match (idempotency key)
>         SC->>SC: skip - a posting seen again unchanged keeps its score, nothing is spent
>     else fingerprint differs
>         Note over SC,D: the old score stays shown, marked scored against an earlier version of this posting
>         SC->>SC: queue after postings with no score, newest first
>         SC->>X: score the current text - reserve, call, validate as flow 1
>         Note over SC,X: provider problems retried at most every 15 minutes, a missing or refused key after a restart (flow 1)
>         alt usable answer
>             X-->>SC: parts, note, claims, usage
>             SC->>D: replace the score with the new fingerprint and profile version, settle cost
>             Note over SC,D: persists one score per posting, keyed by posting id, with text fingerprint and profile version
>         else third unusable answer in a row
>             X-->>SC: answer that fails validation
>             SC->>D: settle cost, mark could not be scored until the posting or the profile changes
>             Note over SC,D: dead-letter - the posting stays in the list in its place with its reason
>         end
>     end
> ```
>
> — `sad.md §6, Flow 7, verbatim` · full text: [sad.md](../sad.md)

> > Timeouts, rate limits, an unreachable provider and key problems are provider problems: the posting stays pending and does not count towards AC-18. The provider key is set only in the owner's local configuration, outside the repository, and never on screen.
>
> — `spec.md §5, AC-14 note, verbatim` · full text: [spec.md](../spec.md)

> | Scoring freshness | a posting with no score that enters the owner's list is scored within 15 minutes p95, also while stale scores are being redone, while the cap is not reached and the provider answers, with up to 50 new postings in an hour | integration test with a stand-in provider; scoring health shows the oldest pending posting's age |
>
> — `spec.md §6, NFR Scoring freshness, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes beyond T13's writes. Reads scores and fingerprints through T05.

## API contract

Internal — no API surface.

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

### AC-13 — cross-context

> **Given** the owner's list (unmarked open postings that match the typed skills and are shown by the remote filter) holds 30 postings that have no score yet, the remote filter hides 20 more, and 5 are marked
> **When** scoring runs
> **Then** the 30 postings in the list are scored, newest first; the hidden and marked postings are not scored; when the owner widens their skills, switches the filter off or starts a one-off look, the postings that newly enter the list are scored in their turn; a posting marked or hidden before its turn is not scored; postings with no score at all are scored before postings whose score is stale (AC-10)
>
> > In the marked view a marked posting shows the last score it had, with its mark if stale; marked postings are never scored again.
>
> > Scoring follows the list the owner sees, not "postings collected since", so postings brought into the list by a change of skills or filter are scored too, and nothing is spent on postings the owner cannot see. With an empty skills field the list is every open posting the filter shows (search AC-10), and the cap bounds the cost.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** the provider is unreachable, refuses job-radar's key, or no key is set up
> **When** scoring is due
> **Then** postings without a current score show "not scored" with the reason in plain language; scoring health shows the problem with the reason and when scoring last succeeded; the main-screen problem marker shows; nothing is hidden; and scoring picks up by itself, newest first and within the cap: after an unreachable or rate-limited provider, it is tried again at most every 15 minutes; after a missing or refused key, it is tried again when job-radar is restarted with a key
>
> > Timeouts, rate limits, an unreachable provider and key problems are provider problems: the posting stays pending and does not count towards AC-18. The provider key is set only in the owner's local configuration, outside the repository, and never on screen.
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — happy

> **Given** the owner has no profile and no CV at hand
> **When** they fill in the profile by hand — core and nice-to-have skills, years, seniority, role types, minimum salary with currency and period, engagement forms — and save it
> **Then** the profile is saved, nothing but the profile is sent to the provider, and the postings in the list are scored newest first within the cap (AC-13)
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `app/scorer.ts`: `createScorer(deps)` → `{ start(signal), wake(), stop() }`; tick every 60 s and at once on `wake()`
- [ ] Each pass: `ownerListIds()` (T11) → scores and fingerprints → queue: no score first, then stale, newest first; skip `could_not_score` with a current key
- [ ] One attempt at a time (concurrency from config); stop the pass on `cap_reached`
- [ ] Provider problem: next try at most every 15 minutes; key problem: no retry until restart
- [ ] Abort-signal shutdown awaits the in-flight attempt (as the collector scheduler)
- [ ] `matching-scorer.integration.test.ts` with a fake clock and the stand-in provider

## Edge cases

| Case | Behaviour |
|---|---|
| Posting seen again unchanged | skipped; nothing spent (AC-06) |
| Profile saved with a change | stale ones redone after every unscored posting (AC-10) |
| Posting marked before its turn | not scored (AC-13) |
| Provider down | retried at most every 15 min; recovers by itself (AC-14) |
| Key refused | no retry until restart |
| Stop during an attempt | waits for it, then exits |

## Definition of Done

**Done when:** `matching-scorer.integration.test.ts` passes every edge-case row and AC-21's first save scoring the list newest first; 50 new postings in an hour are scored within 15 minutes each with the stand-in.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
