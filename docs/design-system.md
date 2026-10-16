---
status: Living
tool: code               # figma | pencil | code — the single committed source of the design-tool choice (never sdd.local.md: that file is per-developer + gitignored)
figma_file: ""           # tool: figma → the Figma file URL/key the canon lives in; else ""
pen_file: ""             # tool: pencil → the .pen library path (e.g. docs/design/library.pen); else ""
updated_at: "2026-09-29"
---

# Design system — job-radar

> The project's **design canon**, produced once per repo by `design-system` and read by
> `ux-flows` / `screens` / `implement` / `review`. Committed — the tool choice and the inventory
> are team-wide, not per-developer. `architecture-map.md` §Frontend / UI foundation stays the
> inventory of the **code**; this file is the **design-side** canon (tool, posture, tokens,
> component inventory, cross-screen conventions). Refresh via `/sdd:design-system` when the
> foundation changes.

## Platform posture

- **Posture:** mobile-first — postings and alerts get triaged on the phone (apply / skip on the go), so every
  screen is designed for a narrow viewport first and gains columns as width grows.
- **Breakpoints / device classes:** Tailwind defaults — base (< 40rem, phone) · `sm` 40rem · `md` 48rem (tablet)
  · `lg` 64rem (laptop). Unprefixed classes describe the phone layout; `md:` / `lg:` add to it, never the reverse.

## Design tool

- **Tool:** code — no design-tool MCP is connected; screens are drawn as inline markdown wireframes in each
  feature's `screens.md`, and the running app is the visual reference.
- **Library location:** the in-repo components are the library — `apps/web/src/components/` (shared primitives),
  styled only through the tokens below.

## Token source

Tailwind v4 theme, CSS-first: one file, `apps/web/src/styles/tokens.css`. Raw values are CSS custom properties
with a light set and a `prefers-color-scheme: dark` set; `@theme inline` exposes them as Tailwind utilities.
Components use the semantic utilities (`bg-surface`, `text-text-muted`, `border-border`, `bg-accent`,
`text-score-high`, …) — never raw hex, arbitrary values (`bg-[#…]`), or Tailwind's stock palette (`bg-blue-500`).
A new token is added to this file (both color schemes), never inline in a component.

- **Colors:** semantic custom properties — `apps/web/src/styles/tokens.css:5` (light), `:19` (dark), exposed as
  `--color-*` at `:35`. Roles: surface / surface-muted / text / text-muted / border / accent / accent-contrast /
  danger, plus the match-score scale score-high / score-mid / score-low.
- **Spacing / sizing:** Tailwind's default spacing scale (0.25rem steps) — not overridden; card corner radius
  `--radius-card` at `apps/web/src/styles/tokens.css:49`.
- **Typography:** system sans stack `--font-sans` at `apps/web/src/styles/tokens.css:48`; Tailwind's default
  type scale; applied to `body` at `apps/web/src/styles/tokens.css:52`.

## Component inventory

Greenfield — no shared primitives exist yet. `implement` registers each new component here (name, `file:line`,
states) when a feature introduces it; `screens.md` declares it as `NEW: <name>` with a why-no-primitive-fits line
until then.

| Component | Source (`file:line` / node / URL) | States it supports | Notes |
|---|---|---|---|
| App shell | `apps/web/src/App.tsx` (`Shell`) | default | Page container: AppNav above `main` with phone padding `px-4`, content capped at `max-w-3xl`. |
| AppNav | `apps/web/src/components/AppNav.tsx:7` | default, current page | Brand + Home / Source health / Profile links; 44px targets (remote-boards-collector; Profile link match-score). |
| Button | `apps/web/src/components/Button.tsx:8` | default, disabled, pending (disabled + inline spinner) | Full width on phones, auto from `md:`. |
| InlineBanner | `apps/web/src/components/InlineBanner.tsx:20` | error (alert, Retry), warning, info (status), with action (`action: { label, onClick, disabled? }`, e.g. "Refresh") | Request failures and notices next to what they are about; API text rendered as text. `action` added by search-postings; `action.disabled` by applied-skipped (Undo while it saves). |
| SkeletonRow | `apps/web/src/components/SkeletonRow.tsx:2` | loading | Card-shaped placeholder for list loading. |
| Badge | `apps/web/src/components/Badge.tsx:12` | enabled, problem, notice, disabled, not_verified, new | Short status label on cards. Tone `new` (`bg-accent text-accent-contrast`) marks postings new since the previous visit (search-postings). |
| SourceCard | `apps/web/src/features/source-health/SourceCard.tsx:6` | healthy, flagged, possibly changed, category notice, filling, disabled, not verified, never collected | One source's health on SCR-02 (remote-boards-collector); composes Badge. |
| ProblemMarker | `apps/web/src/features/source-health/ProblemMarker.tsx:7` | default (shown while a flag can cost postings), scoring only (text names scoring) | Danger-toned link block to /sources on the main screen (remote-boards-collector). match-score shows it for a scoring problem too, via `scoringOnly`. |
| RunProgress | `apps/web/src/features/source-health/RunProgress.tsx:19` | running, finished | Per-source outcome of the run in progress or the last finished run. |
| CollectNowAction | `apps/web/src/features/source-health/CollectNowAction.tsx:16` | idle, pending, nothing due, already running, error | Button + the collect-now answers under it; stays enabled during a run. |
| SkillsField | `apps/web/src/features/search/SkillsField.tsx:17` | idle, pending (button busy, input editable), error (message under the input, `aria-describedby`, `aria-invalid`), disabled | Labelled text input + Search Button; Enter submits; stacked full width on phones (search-postings). |
| PostingCard | `apps/web/src/features/search/PostingCard.tsx` (`PostingCard`) | default, new, publication time unknown, feed (no chips), closed source, unlinked source, look-alike line, marked variant (mark Badge + date, Closed, Cleared · removed after), banner slot, actions slot | One posting on SCR-01: title, company, time, matched-skill Badges, one row per source (link only for an open listing with a URL, new tab, `noopener noreferrer`); composes Badge (search-postings). applied-skipped added the look-alike line, the marked variant and the banner / actions slots (additive props). remote-filter added the check-location line (Badge `notice` "Check location" + reason, `features/remote-filter/LocationCheck.tsx`). match-score added the match slot above the actions (MatchSummary), on main and marked cards. realness-score added the reason slot under the match (ReasonLine), on main cards only, given the list's `order`. |
| MarkActions | `apps/web/src/features/tracking/MarkActions.tsx` (`MarkActions`) | unmarked (Applied + Skipped), marked (other mark + Clear), pending, confirm (AC-07 warning + Continue / Cancel) | Two 44 px Buttons in a two-column grid, 8 px apart, at the bottom of a card; accessible names include the posting title (applied-skipped). |
| SearchList | `apps/web/src/features/search/SearchList.tsx:27` | default, feed, first visit, nothing matches, collection empty, nothing left to review, waiting, show more (pending, error, done) | SCR-01 summary line, waiting notice, PostingCard list and show-more; composes InlineBanner, Button, PostingCard (search-postings). applied-skipped added MarkActions per card, the in-card save-error banner and the nothing-left-to-review state. remote-filter added the summary's hidden part ("— N hidden, not open to X") and the filter-hid-everything state (Switch filter off / Back to own, Clear skills), which wins over nothing-left-to-review. |
| MarkedList | `apps/web/src/features/search/MarkedList.tsx` (`MarkedList`) | default (N marked and N cleared), empty, card changed in place, at-risk confirm, save error, show more (pending, error, done) | The marked view on SCR-01 (applied-skipped AC-05 – AC-07); composes PostingCard (marked variant), MarkActions, InlineBanner, Button. |
| MarkedToggle | `apps/web/src/features/tracking/MarkedToggle.tsx` (`MarkedToggle`) | off, on, disabled | "Show marked postings": native checkbox with `role="switch"` in a 44 px label; off on every visit (applied-skipped). |
| UndoNotice | `apps/web/src/features/tracking/UndoNotice.tsx` (`UndoNotice`) | marked / cleared (Undo, 8 s), undo failed (Retry, stays), changed elsewhere (Show marked postings), posting gone | Sticky bottom InlineBanner; one at a time, replaced by the next change (applied-skipped AC-03). |
| LocationFilterBar | `apps/web/src/features/remote-filter/LocationFilterBar.tsx` (`LocationFilterBar`) | settings loading, settings error (Retry), no country, own, off, look (Back to own / all postings), switching (pressed action pending, others disabled), switch error (Retry), choice open | SCR-01 location bar under the skills field: the filter's state from `SearchResult.location_filter` with one to three Buttons that wrap with `gap-2`; opens CountryChoice in place; composes Button, InlineBanner, SkeletonRow (remote-filter). |
| CountryChoice | `apps/web/src/features/remote-filter/CountryChoice.tsx` (`CountryChoice`) | open (own: "Your country" + Save; look: "Look at postings open to" + Look), saving (submit pending, input editable), unknown name (message under the input, `aria-describedby`, `aria-invalid`, live once flagged), save error (Retry, name kept), cancelled (Cancel / Escape) | Labelled text input with a native `<datalist>` of the country list; Enter submits, Escape cancels; follows SkillsField's error pattern; composes Button, InlineBanner (remote-filter). |
| ScoreBadge | `apps/web/src/features/matching/ScoreBadge.tsx:7` | high (≥ 70), mid (40–69), low (< 40) | The match total as a number toned by the `score-*` tokens; `role="img"` named "Match N out of 100" (match-score). |
| MatchSummary | `apps/web/src/features/matching/MatchSummary.tsx:31` | scored, parts open, stale — posting changed, stale — profile changed, pending, not scored, cap reached, could not be scored | On each PostingCard: ScoreBadge + fit note as plain text; Details opens the four parts and "The posting says: …" claims in place (match-score SCR-01). |
| OrderSwitch | `apps/web/src/features/matching/OrderSwitch.tsx:9` | newest first, best match, disabled | Native radio group as a segmented control, 44 px options (match-score AC-11). Shown without a profile too (realness-score ADR-0003). |
| ScoringNotice | `apps/web/src/features/matching/ScoringNotice.tsx:12` | no profile, no profile in best match first (adds the realness sentence), cap reached, none | One status line above the list with a link to /profile (match-score AC-12, AC-15). |
| ScoringHealthCard | `apps/web/src/features/source-health/ScoringHealthCard.tsx:25` | loading, healthy, provider or key problem, cap reached, no profile, error | Scoring beside the sources on SCR-02; composes Badge, InlineBanner, SkeletonRow (match-score). |
| ProfileForm | `apps/web/src/features/matching/ProfileForm.tsx:103` | empty, filled, validation (live once flagged), saving, footer replaced (notice), custom submit label | The seven profile fields with field errors under each; rules mirror the server's table (match-score AC-16, F-1). |
| CvUpload | `apps/web/src/features/matching/CvUpload.tsx:44` | idle, pending ("Reading your CV…"), refused (message under the button) | Native file input behind a labelled 44 px button; kind and 5 MB checked before sending (match-score AC-08). |
| DraftReview | `apps/web/src/features/matching/DraftReview.tsx:45` | draft ready (tags, not mapped, removed details, current profile collapsible) | The CV draft with provenance, corrected in ProfileForm and used or discarded (match-score AC-07, AC-09). |
| DataNotice | `apps/web/src/features/matching/DataNotice.tsx:8` | shown, agreeing, error | The one-time consent step; blocks the action that triggered it, "Not now" sends nothing (match-score AC-20). |
| CapField | `apps/web/src/features/matching/CapField.tsx:24` | default, validation, saving, saved (resumes / stays stopped / paused), error | The monthly scoring cap in dollars with this month's spend (match-score AC-19). |
| ReasonLine | `apps/web/src/features/realness/ReasonLine.tsx:18` | lowered (best match first, "Lowered: …"), signals (newest first, "Signals: …"), none (renders nothing) | One `text-sm text-text-muted` sentence built only from the API's realness signals in fixed phrases joined by " · ", never from posting text; wraps at 360 px (realness-score SCR-01). |
| RealnessSwitch | `apps/web/src/features/realness/RealnessSwitch.tsx:9` | on, off, saving (asked-for state, disabled), disabled while the list reloads, save error (previous state + InlineBanner with Retry of the same change) | "Lower stale postings": MarkedToggle's native switch in a 44 px label, after OrderSwitch in the controls row; hidden in the marked view; composes InlineBanner (realness-score AC-10, AC-11). |

## Interaction & writing conventions

- **Errors:** inline, next to what failed — a banner at the top of the affected section for request failures
  (showing the API envelope's `message`, with a retry action); no toasts for errors.
- **Empty states:** plain text saying why the list is empty + one primary action (e.g. "No postings match — widen
  the filter"); no illustrations.
- **Loading:** skeleton rows shaped like the content for lists; a disabled button with an inline spinner for
  actions; never a full-screen blocker.
- **Validation:** on submit, then live per field once it has been flagged; the message sits under the field in
  `text-danger`.
- **Microcopy tone:** short, plain, second person ("You applied 2 days ago"); no marketing voice, no exclamation marks.
- **Touch & reach:** interactive targets at least 44×44px; the primary actions on a posting (apply / skip) sit in
  thumb reach at the bottom of the card on phones.
