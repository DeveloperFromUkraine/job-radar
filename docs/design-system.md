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
| AppNav | `apps/web/src/components/AppNav.tsx:7` | default, current page | Brand + Home / Source health links; 44px targets (remote-boards-collector). |
| Button | `apps/web/src/components/Button.tsx:8` | default, disabled, pending (disabled + inline spinner) | Full width on phones, auto from `md:`. |
| InlineBanner | `apps/web/src/components/InlineBanner.tsx:18` | error (alert, Retry), warning, info (status) | Request failures and notices next to what they are about; API text rendered as text. |
| SkeletonRow | `apps/web/src/components/SkeletonRow.tsx:2` | loading | Card-shaped placeholder for list loading. |
| Badge | `apps/web/src/components/Badge.tsx:11` | enabled, problem, notice, disabled, not_verified | Short status label on cards. |
| SourceCard | `apps/web/src/features/source-health/SourceCard.tsx:6` | healthy, flagged, possibly changed, category notice, filling, disabled, not verified, never collected | One source's health on SCR-02 (remote-boards-collector); composes Badge. |
| ProblemMarker | `apps/web/src/features/source-health/ProblemMarker.tsx:4` | default (shown while a flag can cost postings) | Danger-toned link block to /sources on the main screen (remote-boards-collector). |
| RunProgress | `apps/web/src/features/source-health/RunProgress.tsx:19` | running, finished | Per-source outcome of the run in progress or the last finished run. |
| CollectNowAction | `apps/web/src/features/source-health/CollectNowAction.tsx:16` | idle, pending, nothing due, already running, error | Button + the collect-now answers under it; stays enabled during a run. |

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
