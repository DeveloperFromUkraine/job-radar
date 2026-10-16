---
id: T18
title: "Add the scoring health card to the source health screen"
layer: "ui"
deps: ["T16"]
blocks: []
acs: ["AC-12", "AC-14", "AC-18"]
files_hint: ["apps/web/src/features/source-health/ScoringHealthCard.tsx", "apps/web/src/routes/SourceHealth.tsx"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T18 — Add the scoring health card to the source health screen

## Place in the sequence

- **Blocked by:** T16 — Show the match on every card: API types, ScoreBadge and MatchSummary in the main list and the marked view · **Blocks:** — · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** every posting without a score to say why, and scoring problems to show where source problems show
> **So that** I never mistake a missing score for a bad fit, and I notice when scoring has stopped
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Shows the owner whether scoring works, what it has cost this month and why it stopped.

## Inlined context

> | loading | `getScoringHealth` in flight. One card-shaped placeholder | SkeletonRow | — |
> | healthy | `problem: null` (AC-14). "Scoring" heading with these rows: last scored "5 min ago"; "$1.20 of $5.00 this month"; "3 pending · oldest 10 min"; "1 could not be scored this month" (AC-18). Pending ages come from `first_found_at` (F-5) | NEW: ScoringHealthCard, Badge (enabled "Working") | wireframe 02-a |
> | provider or key problem | `problem.kind` is `provider_unreachable` / `rate_limited` / `key_missing` / `key_refused` (AC-14). Badge `problem` "Not scoring". `problem.reason` is shown as text, plus "Last scored 14 h ago". For a key problem the hint reads "Set a valid key in your local configuration and restart job-radar". The key itself is never shown | ScoringHealthCard, Badge (problem) | wireframe 02-b |
> | cap reached | `problem.kind: cap_reached` (AC-12). Badge `notice` "Cap reached", the line "$4.98 of $5.00 — resumes on 1 November", and the action "Change cap" (→ SCR-03) | ScoringHealthCard, Badge (notice), Button | — |
> | no profile | `pending_count: 0` and no last success while there is no profile. "Scoring starts once you set up your profile", with the action "Set up profile" | ScoringHealthCard, Button | — |
> | error | `getScoringHealth` 500. The API message with Retry in the block's place. The sources still show | InlineBanner (error, Retry) | — |
> | empty | N/A: the block always has figures, zeros included | — | — |
>
> — `screens.md §SCR-02, states, verbatim` · full text: [screens.md](../screens.md)

> | ScoringHealthCard | SourceCard is bound to one source's flags and runs. Scoring has spend, pending, age and a problem with a reason. It composes Badge, Button and InlineBanner | pending |
>
> — `screens.md §New components, ScoringHealthCard, verbatim` · full text: [screens.md](../screens.md)

> Components use the semantic utilities (`bg-surface`, `text-text-muted`, `border-border`, `bg-accent`,
> `text-score-high`, …) — never raw hex, arbitrary values (`bg-[#…]`), or Tailwind's stock palette (`bg-blue-500`).
>
> — `docs/design-system.md §Token source, verbatim` · full text: [design-system.md](../../../design-system.md)

> - **Errors:** inline, next to what failed — a banner at the top of the affected section for request failures
>   (showing the API envelope's `message`, with a retry action); no toasts for errors.
> - **Validation:** on submit, then live per field once it has been flagged; the message sits under the field in
>   `text-danger`.
> - **Touch & reach:** interactive targets at least 44×44px
>
> — `docs/design-system.md §Interaction & writing conventions, abridged` · full text: [design-system.md](../../../design-system.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

`getScoringHealth` → `ScoringHealth` (examples `healthy`, `key_refused`, `cap_reached`).

— `contracts/openapi.yaml, operationId getScoringHealth, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

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

### AC-18 — error

> **Given** the provider answers for a posting on three consecutive attempts — in the same scoring pass or not — with something that is not a usable score: no number, a number outside 0 to 100, a missing part, a fit note over 40 words, or a refusal to handle the posting's text
> **When** the third answer arrives
> **Then** the posting shows "not scored — could not be scored" with the reason in plain language, stays in the list in its place, and is not tried again until the posting or the profile changes; all three attempts count against the scoring cap; scoring health shows how many postings could not be scored this month
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `ScoringHealthCard.tsx` with every SCR-02 state; money from cents as `$1.20`; ages from `lib/time.ts`
- [ ] `SourceHealth.tsx`: the card above the sources; an error banner does not hide the sources
- [ ] Tests with the three contract examples plus loading and error

## Edge cases

| Case | Behaviour |
|---|---|
| Key problem | reason + restart hint; never the key |
| Cap reached | "$4.98 of $5.00 — resumes on 1 November" + Change cap |
| Health 500 | banner with Retry; sources still shown |

## Definition of Done

**Done when:** Testing Library tests pass for every SCR-02 state using the contract's `healthy`, `key_refused` and `cap_reached` examples.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
