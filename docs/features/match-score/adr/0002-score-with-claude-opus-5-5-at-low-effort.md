---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead"]
updated_at: "2026-10-15"
feature_size: "M"
ticket: "roadmap step 4"
---

# 0002 — Score with Claude Opus 5.5 at low effort

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Volodymyr Kozlov (owner, Tech Lead), with Claude during the design walk

## Context

The architecture map says "Claude through the official Anthropic SDK; the model is chosen in the match-score feature". The model drafts a profile from CV text (rare) and scores a posting against the profile (tens a day). Quality of the part scores and the fit note drives the success KPI (applied vs skipped separation, spec §7) and resistance to wording planted in posting text (spec AC-03); price per scoring decides how many postings fit in the monthly scoring cap (default $5, spec AC-12).

## Decision drivers

- Spec §7: applied vs skipped median separation of at least 15 points; Score stability NFR (≤ 10 points in 95% of cases).
- Spec AC-03: posting text must not steer the score.
- Spec AC-12 / NFR Spending: the month's spend never exceeds the cap; the owner raises the cap themselves (AC-19).
- Estimated volume: 20–50 new postings a day in the owner's list, 600–1,500 scorings a month, plus re-scoring after profile edits.

## Considered options

Estimates for one scoring of ~3,000 input tokens (about half cacheable: instructions and profile) and 400–800 output tokens, at list prices on 2026-10-15; to be replaced by measured figures in `implement`:

1. **Claude Opus 5.5 (`claude-opus-5-5`, $4 / $20 per million tokens, cache reads $0.20), effort `low`** — about $0.018 per scoring, about 270 scorings for $5.
2. **Claude Sonnet 5.5 (`claude-sonnet-5-5`, $2 / $10)** — about $0.009 per scoring, about 540 for $5.
3. **Claude Haiku 4.5 (`claude-haiku-4-5`, $1 / $5)** — about $0.004 per scoring, about 1,300 for $5.

## Decision outcome

**Chosen:** Option 1, for both scoring and drafting, at effort `low` (thinking cannot be switched off on Opus 5.5; `low` keeps it short for a classification-shaped task). The owner chose quality over volume knowing that the $5 default covers roughly a week or two of their stream; the cap stays $5 by default and the owner raises it (AC-19) — about $15–30 a month covers the full stream. The model id and its prices are configuration, not code.

## Consequences

**Positive**
- The strongest current model on the two qualities the KPI and AC-03 depend on.
- One model for drafting and scoring: one prompt-cache namespace, one price row.

**Negative**
- At the default cap, scoring stops part-way through the month (AC-12 shows it); the owner must raise the cap for full coverage.
- Opus 5.5 rejects forced tool choice and cannot disable thinking; the scoring contract uses structured output instead ([[0008-constrain-model-output-to-part-scores-and-compute-the-total-in-job-radar]]).

**Neutral**
- Switching to Sonnet 5.5 or Haiku 4.5 is a configuration change (model id + price row) plus a Score stability re-run; refusals (`stop_reason: refusal`) are treated as unusable answers (spec AC-18).

## Links

- Spec: [[../spec.md]] AC-03, AC-12, AC-19, §6, §7
- SAD: [[../sad.md]] §4, §10
- Related ADR: [[0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage]], [[0008-constrain-model-output-to-part-scores-and-compute-the-total-in-job-radar]]
