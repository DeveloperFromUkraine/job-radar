---
id: T03
title: "Write the score rules: total with fixed weights, answer validation, text fingerprint, staleness and the match state"
layer: "domain"
deps: []
blocks: ["T06", "T12", "T13"]
acs: ["AC-01", "AC-04", "AC-06", "AC-10", "AC-18"]
files_hint: ["apps/server/src/modules/matching/domain/score.ts", "apps/server/src/modules/matching/domain/score.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T03 — Write the score rules: total with fixed weights, answer validation, text fingerprint, staleness and the match state

## Place in the sequence

- **Blocked by:** — · **Blocks:** T06 — Add the Claude client: SDK, configuration, fixed output schemas, usage, error classes and a stand-in provider, T12 — Implement matching's score reader and scoring health, T13 — Implement one scoring attempt: reserve, ask, validate, store or strike, settle · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** each posting in my list to show a match score with a short note on why it fits and what is missing
> **So that** I can tell which postings deserve my time without opening every one
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** every posting without a score to say why, and scoring problems to show where source problems show
> **So that** I never mistake a missing score for a bad fit, and I notice when scoring has stopped
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

The rules that turn a model answer into a stored score, decide when a score is stale, and say why a posting has none.

## Inlined context

> **Chosen:** Option 1. Planted wording cannot set the total, because the model never returns it; the weights and the neutral rule live in tested code. One call per scoring keeps the cap's capacity (option 2 halves it) and the accounting simple. Claims are returned as a list and shown as "the posting says…", so the note never presents them as job-radar's judgement.
>
> — `adr/0008, Decision outcome, verbatim` · full text: [0008-constrain-model-output-to-part-scores-and-compute-the-total-in-job-radar.md](../adr/0008-constrain-model-output-to-part-scores-and-compute-the-total-in-job-radar.md)

> **Chosen:** Option 1. The text hash covers only what the scorer reads — title, company, description and the open listings' location restrictions — so a changed link or a re-seen unchanged posting costs nothing; the collector is untouched. The score row is removed with its posting (cascade), like tracking marks (applied-skipped ADR-0003).
>
> — `adr/0005, Decision outcome, verbatim` · full text: [0005-keep-one-score-per-posting-with-text-and-profile-fingerprints.md](../adr/0005-keep-one-score-per-posting-with-text-and-profile-fingerprints.md)

> | `strike_key` | text | | Text fingerprint + profile version + scorer version the strikes were made against. When it differs from today's key, the strikes are void ("until the posting or the profile changes"), and the next strike starts again from 1. |
>
> — `data-model.md §Entities, matching_scores.strike_key, verbatim` · full text: [data-model.md](../data-model.md)

> | `scorer_version` | text | | Version of the prompt and output schema (ADR-0008). A change makes the score stale and is shown as a previous-profile staleness. |
>
> — `data-model.md §Entities, matching_scores.scorer_version, verbatim` · full text: [data-model.md](../data-model.md)

> | Match.state | computed from `matching_scores` + `scoring_problem` + cap (CONTEXT Match score; AC-12, AC-14, AC-18) | high |
> | Match.total, .parts.* | data-model → `matching_scores.total`, `*_part` | high |
> | Match.note, .claims | data-model → `matching_scores.note`, `.claims` | high |
> | Match.stale | computed: `text_fingerprint` vs today's / `profile_version` + `scorer_version` vs current (ADR-0005) | high |
> | Match.reason | computed plain text from state, `last_failure`, `scoring_problem` | high |
>
> — `contracts/api-sync-report.md §A, Field origins, Match, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> | Untrusted text | Posting text and model output are data: the fit note and quoted claims render as plain text, claims as "the posting says…" (AC-03); posting text enters prompts only inside a delimited data block | search AC-09, ADR-0008 |
>
> — `sad.md §8, Untrusted text, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. (Pure rules over the `matching_scores` columns; T05 persists them.)

## API contract

`Match { state: scored|pending|not_scored|cap_reached|could_not_score, total 0–100|null, parts {skills, role_type, seniority, terms: 0–100|null}|null, note|null, claims[], stale: posting_changed|profile_changed|null, reason|null }`. When both fingerprints differ, `stale` is `posting_changed`.

— `contracts/openapi.yaml, schemas Match / MatchParts, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** the owner's profile lists TypeScript and React as core skills, Node as nice-to-have, senior seniority, backend and fullstack as wanted role types, a minimum salary of 6,000 EUR gross a month and B2B as the engagement form, and a posting in the list is a senior fullstack role asking for TypeScript and React, offering 7,000–9,000 EUR a month on B2B
> **When** the owner opens the main screen after the posting has been scored
> **Then** the posting's card shows a match score of at least 80 (out of 100), its four parts (skills, seniority, role type, terms) each with its own number from 0 to 100 or "not stated", and a fit note of at most 40 words that names the matched core skills and says what is missing, if anything
>
> > How the score is made: each part gets its own number from 0 to 100, or "not stated" when the posting gives nothing for it. job-radar combines the stated parts with fixed weights — skills 50, role type 20, seniority 15, terms 15 — and a "not stated" part is left out, its weight shared among the stated parts in proportion ("neutral"). The weights are not editable; the profile's weighting is each skill's core or nice-to-have mark. Terms meet the minimum salary when the top of the posting's range, converted at an approximate rate to the profile's currency and period, is at or above it; the note shows both amounts.
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** the owner's profile sets a minimum salary and a seniority, and a posting states neither a salary nor a level
> **When** the posting is scored
> **Then** the terms and seniority parts read "not stated" and do not lower the score; the score comes from what the posting does state, and the note does not guess a salary or a level the posting does not give
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

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

### AC-18 — error

> **Given** the provider answers for a posting on three consecutive attempts — in the same scoring pass or not — with something that is not a usable score: no number, a number outside 0 to 100, a missing part, a fit note over 40 words, or a refusal to handle the posting's text
> **When** the third answer arrives
> **Then** the posting shows "not scored — could not be scored" with the reason in plain language, stays in the list in its place, and is not tried again until the posting or the profile changes; all three attempts count against the scoring cap; scoring health shows how many postings could not be scored this month
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `total(parts)`: weights skills 50, role type 20, seniority 15, terms 15; a null part is left out and its weight shared in proportion; all null → no total (AC-01 note)
- [ ] `validateAnswer(raw)` → `{ ok, score } | { ok: false, reason }` (AC-18): every part present, each 0–100 or "not stated", note ≤ 40 words, claims a list of strings, a refusal is unusable
- [ ] `textFingerprint({ title, company, description, openLocationRestrictions })`: SHA-256 over a stable join (ADR-0005)
- [ ] `staleness(score, current)` and `strikeKey(...)`; `SCORER_VERSION` constant
- [ ] `matchState(row, ctx)` → `Match` from the row, the current key, the scoring problem and cap-reached (contract `Match.state` rules)
- [ ] `domain/score.test.ts`: the AC-01 example ≥ 80, AC-04 neutral parts, all AC-18 unusable shapes, stale precedence

## Edge cases

| Case | Behaviour |
|---|---|
| Parts 95/100/100/null | total from 50+20+15 weights rescaled to 85; terms reads "not stated" |
| A part of 101 or a missing part | unusable answer → a strike |
| Note of 41 words | unusable answer → a strike |
| Third strike with the same key | `could_not_score`; a new key resets the count |
| Text and profile both changed | `stale: posting_changed` |
| Stale score while the cap is reached | state stays `scored` with its stale mark (AC-12) |

## Definition of Done

**Done when:** `score.test.ts` passes: AC-01's example scores ≥ 80, AC-04's unstated parts do not lower it, every AC-18 unusable shape is refused, and staleness/state follow the contract table.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
