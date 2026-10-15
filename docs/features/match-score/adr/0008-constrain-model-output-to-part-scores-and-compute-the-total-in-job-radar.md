---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-15"
feature_size: "M"
ticket: "roadmap step 4"
---

# 0008 — Constrain model output to part scores and compute the total in job-radar

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

Posting text is third-party content and can contain wording aimed at the scorer (spec AC-03). The score is four parts — skills, role type, seniority, terms — each 0–100 or "not stated", combined with fixed weights 50 / 20 / 15 / 15, an unstated part's weight shared among the stated ones (spec AC-01 note). Answers that are not usable — no number, out of range, a missing part, a note over 40 words, a refusal — count towards three strikes (AC-18).

## Decision drivers

- Spec AC-03: wording addressed to the scorer must not raise the score by more than 10 points (median of five).
- Spec AC-01, AC-04: parts and the neutral rule are fixed and testable.
- Spec AC-18: a usable answer has a fixed shape.
- ADR-0002: forced tool choice is rejected on the chosen model; structured output is the supported way to get JSON.

## Considered options

1. **Structured output + total in job-radar.** The response is constrained to a JSON schema: four parts (integer 0–100 or null), a fit note, and the claims taken from the posting. Posting text goes in a clearly delimited data block that the instructions say to treat as data only. job-radar validates the answer and computes the total itself.
2. **Two calls:** one extracts the posting's facts, a second scores the facts against the profile.

## Decision outcome

**Chosen:** Option 1. Planted wording cannot set the total, because the model never returns it; the weights and the neutral rule live in tested code. One call per scoring keeps the cap's capacity (option 2 halves it) and the accounting simple. Claims are returned as a list and shown as "the posting says…", so the note never presents them as job-radar's judgement.

## Consequences

**Positive**
- The total, its parts and the neutral rule are unit-testable without a model.
- Validation failures map one-to-one onto AC-18 strikes.

**Negative**
- Defence against planted wording in the parts rests on instructions and the model; it is measured, not guaranteed (spec AC-03 evaluation run).

**Neutral**
- The schema is versioned with the prompt; changing either makes every score stale through the profile-version fingerprint ([[0005-keep-one-score-per-posting-with-text-and-profile-fingerprints]]).

## Links

- Spec: [[../spec.md]] AC-01, AC-03, AC-04, AC-18
- SAD: [[../sad.md]] §4, §8, §10
- Related ADR: [[0002-score-with-claude-opus-5-5-at-low-effort]]
