---
id: T17
title: "Add the order switch, the no-profile and cap-reached line, and scoring problems in the marker"
layer: "ui"
deps: ["T16"]
blocks: ["T21"]
acs: ["AC-11", "AC-12", "AC-14", "AC-15"]
files_hint: ["apps/web/src/features/matching/OrderSwitch.tsx", "apps/web/src/features/matching/ScoringNotice.tsx", "apps/web/src/features/matching/queries.ts", "apps/web/src/features/search/SearchList.tsx", "apps/web/src/features/search/queries.ts", "apps/web/src/features/source-health/ProblemMarker.tsx", "apps/web/src/routes/Home.tsx"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T17 — Add the order switch, the no-profile and cap-reached line, and scoring problems in the marker

## Place in the sequence

- **Blocked by:** T16 — Show the match on every card: API types, ScoreBadge and MatchSummary in the main list and the marked view · **Blocks:** T21 — Prove the invariants and NFRs end to end, and add the real-model evaluation run · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to switch the list to best match first and back to newest first
> **So that** I can work through the strongest fits without losing sight of fresh postings
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** every posting without a score to say why, and scoring problems to show where source problems show
> **So that** I never mistake a missing score for a bad fit, and I notice when scoring has stopped
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Lets the owner put the best matches first and tells them, on the main screen, when there are no scores or scoring has stopped.

## Inlined context

> | newest first | `SearchResult.order: newest`, the default for an owner who never chose (AC-11). The switch shows "Newest first" as selected | NEW: OrderSwitch | wireframe 01-a |
> | best match first | `order: best_match` (AC-11). Postings with no score come first, newest first, then scored ones from high to low. The order is fixed until a refresh, and a score that arrives later shows on its card without moving it | OrderSwitch | wireframe 01-b |
> | switching order | The owner picks the other order. `runSearch` runs with `order` and the list reloads from the top with SearchList's existing loading state. The choice is kept for the next opening | OrderSwitch (disabled while loading), SkeletonRow | — |
> | no profile | `has_profile: false` (AC-15). One line above the list: "No scores yet — set up your profile to see how each posting fits", with the action "Set up profile" (→ SCR-03). There is no order switch, no match on any card, and the order is newest first | NEW: ScoringNotice (info), Button | wireframe 01-c |
> | cap reached | `getScoringHealth.cap_reached` (AC-12). The line reads "This month's scoring cap is reached. Scoring resumes on 1 November.", with the action "Change cap" (→ SCR-03). The list, search, filter and marks work as before | ScoringNotice (warning), Button | wireframe 01-d |
> | scoring problem | `getScoringHealth.problem` is set and not `cap_reached` (AC-14). The existing ProblemMarker shows and leads to SCR-02. Its text names scoring when only scoring has the problem ("Scoring has a problem — see source health") | ProblemMarker (text extended) | — |
> | scores unreadable | `runSearch` is answered with `match: null` everywhere while `has_profile` is true (contract F-3, fail-open). The list shows newest first with no matches and no notice of its own; the problem shows through scoring health if it persists | SearchList (unchanged) | — |
>
> — `screens.md §SCR-01, Order and notices, verbatim` · full text: [screens.md](../screens.md)

> | best match first | `order: best_match` (AC-11). Postings with no score come first, newest first, then scored ones from high to low. The order is fixed until a refresh, and a score that arrives later shows on its card without moving it | OrderSwitch | wireframe 01-b |
>
> — `screens.md §New components, OrderSwitch, verbatim` · full text: [screens.md](../screens.md)

> | ScoringNotice | InlineBanner covers the look (info / warning). This is a thin wrapper that picks the no-profile or cap-reached text and action from health and settings, so SearchList need not know scoring. It composes InlineBanner and Button | pending |
>
> — `screens.md §New components, ScoringNotice, verbatim` · full text: [screens.md](../screens.md)

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

- `runSearch { skills, order }` when the owner switches; otherwise without `order` (kept one). Reads `SearchResult.order`, `has_profile`.
- `getScoringHealth` on opening, beside `GET /api/v1/collector/problems`; the marker shows when either reports a problem; a health read failure shows nothing.

— `contracts/openapi.yaml, operationIds runSearch / getScoringHealth, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-11 — happy

> **Given** the owner's list holds 130 postings: 110 scored (5 of them against an earlier version of the posting), 15 pending, and 5 that could not be scored
> **When** the owner switches to best match first and asks for more twice
> **Then** they see first the 20 postings without a score, newest first, then the 110 scored postings — including those scored against an earlier version of the posting or of the profile, by their existing score and with their mark — from highest score to lowest (equal scores newest first), paged 50 at a time in the same order as one long list; switching back shows newest first again; the choice is kept for the next opening
>
> > The best-match order is fixed when the list is loaded, as the list itself is (search AC-16): a score that arrives later shows on its card but does not move the posting, and paging never repeats or skips a posting, until the owner refreshes the list. The default order for an owner who never chose is newest first.
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

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

## Checklist

- [ ] `OrderSwitch.tsx`: native radio group as a segmented control, 44 px options, disabled while loading
- [ ] `ScoringNotice.tsx`: no-profile ("Set up profile" → /profile) or cap-reached ("Change cap") from `has_profile` and health
- [ ] `features/matching/queries.ts`: `useScoringHealth`
- [ ] `SearchList` / `Home`: place the switch beside MarkedToggle, hidden in the marked view; reload on switch
- [ ] `ProblemMarker`: also shows for a scoring problem (text names scoring when only scoring has it)
- [ ] Tests per state with contract examples

## Edge cases

| Case | Behaviour |
|---|---|
| Owner never chose an order | newest first selected |
| Marked view on | switch hidden |
| `has_profile: false` | no switch, the no-profile line |
| Health request fails | nothing shown; list unaffected |
| Only the collector has a problem | marker as before |

## Definition of Done

**Done when:** Testing Library tests pass for every row of SCR-01 "Order and notices", including the switch round trip keeping the choice after a remount.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
