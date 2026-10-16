---
status: draft
feature_size: "S"
tool: "code"
updated_at: "2026-10-16"
---

# Screens — realness-score

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code (from `docs/design-system.md`)
- **File:** inline wireframes below. Only the realness additions to SCR-01 are drawn; every other part of the main screen is as in the search-postings, applied-skipped, remote-filter and match-score manifests.

## Screens

### SCR-01 — Main screen (realness additions)

Derived from spec AC-01 – AC-14 (AC-12 has no screen; AC-14's records have no screen), `ux-flows.md` flows US-01 – US-05, `sad.md` §6 flows 1, 2, 5 and the contract (`setRealnessOn` 503 `REALNESS_SETTINGS_UNAVAILABLE`; `Posting.realness`; `SearchResult.realness_on`).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default — best match, lowered | `order: best_match`, `realness_on: true`; a card with `realness` (AC-01, AC-02) | RealnessSwitch (NEW) beside OrderSwitch; PostingCard + MatchSummary (score unchanged) + ReasonLine (NEW) "Lowered: …" | wireframe A |
| newest first, signals | `order: newest`, `realness_on: true` (AC-02, AC-04) | PostingCard + ReasonLine "Signals: …"; order exactly as search gives it | wireframe B |
| card with no signal | `realness: null` (AC-02) | PostingCard as today; no ReasonLine | wireframe A (card 1) |
| realness off | `realness_on: false` (AC-10) | RealnessSwitch off; no ReasonLine on any card, in either order | wireframe C |
| switching (saving) | Owner flips the switch: `setRealnessOn` then `runSearch` (flow 2) | RealnessSwitch disabled while saving and while the list reloads, as OrderSwitch is during `list.isFetching`; the list stays visible with kept previous data | wireframe C (switch disabled) |
| save error | `setRealnessOn` → 503 `REALNESS_SETTINGS_UNAVAILABLE` or any failure (AC-11) | RealnessSwitch back to its previous state; InlineBanner `error` directly under the switch row: title "Your realness choice was not saved.", body = API `message`, Retry repeats the same change; the list is unchanged | wireframe D |
| no profile, best match | `has_profile: false`, `order: best_match` (ADR-0003, AC-05) | OrderSwitch now shown without a profile; ScoringNotice no-profile line gains one sentence: "Until you set up a profile, best match first puts postings with fewer realness signals first."; cards carry "Lowered" lines | wireframe E |
| look-alike + reason | A reposted posting that is also a look-alike (AC-08) | PostingCard look-alike line as today, plus ReasonLine with "reposted" | wireframe B (card 2) |
| loading | First list load | Switch row not rendered until the first result arrives (it reads `realness_on` from `SearchResult`, as OrderSwitch reads `order`); SkeletonRow list as today | — (unchanged loading) |
| marked view | "Show marked postings" on | RealnessSwitch hidden, as OrderSwitch is; marked cards carry no ReasonLine | — (unchanged marked view) |
| realness unreadable | Server fails open: `realness: null` everywhere, `realness_on` as last known (sad.md §8, flow 5) | Switch shows the reported state; no ReasonLine. No banner: the list is complete and ordered by score | wireframe C (lines absent) |
| empty | N/A: realness never hides a posting or changes a count (AC-03), so SearchList's existing empty states are unchanged | — | — |
| validation | N/A: the switch is a boolean, so there is no field to validate | — | — |

**Reason line wording** (ReasonLine, built only from `signals`, never from posting text, spec §6.1):
- Prefix "Lowered: " in best match first, "Signals: " in newest first. Phrases joined with " · ", in the order the API sends them.
- `age` → "posted N days ago" (`basis: posted`) or "first found N days ago" (`basis: first_found`).
- `many_boards` → "on N boards · first found N days ago".
- `repost` → "reposted".
- `no_salary` → "no salary listed".
- `text-sm text-text-muted`. It wraps at 360 px; no truncation, no horizontal scroll.

**RealnessSwitch:**
- A native checkbox with `role="switch"` inside a 44 px label, the same pattern as MarkedToggle. Label: "Lower stale postings". Its accessible description is "Moves postings with realness signals lower in best match first".
- It sits in the controls row after OrderSwitch and before MarkedToggle. The row wraps with `gap-2` on phones.

```text
A — default, best match first, realness on (360 px)
+--------------------------------------------+
| [Newest first|(Best match)]                |
| [x] Lower stale postings  [ ] Show marked  |
|--------------------------------------------|
| Backend Engineer · Example Co              |
| 6 days ago · himalayas                     |
| (88) Fits your TypeScript backend work…    |
| [ Applied ] [ Skipped ]                    |
|--------------------------------------------|
| Fullstack Engineer · Example Co            |
| (70) Partly fits; frontend-heavy.          |
| [ Applied ] [ Skipped ]                    |
|--------------------------------------------|
| Senior Backend Engineer · Example Co       |
| 65 days ago · jobicy                       |
| (92) Strong fit for your senior TypeScri…  |
| Lowered: posted 65 days ago ·              |
|   no salary listed                         |
| [ Applied ] [ Skipped ]                    |
+--------------------------------------------+

B — newest first, realness on
+--------------------------------------------+
| [(Newest first)|Best match]                |
| [x] Lower stale postings  [ ] Show marked  |
|--------------------------------------------|
| Go Engineer · Example Co                   |
| first found 47 days ago · weworkremotely   |
| Signals: first found 47 days ago ·         |
|   reposted · no salary listed              |
|--------------------------------------------|
| Data Engineer · Example Co                 |
| Looks like a posting you skipped on 2 Sep  |
| Signals: reposted                          |
+--------------------------------------------+

C — realness off (also: switching, with the switch disabled)
+--------------------------------------------+
| [Newest first|(Best match)]                |
| [ ] Lower stale postings  [ ] Show marked  |
|--------------------------------------------|
| Senior Backend Engineer · Example Co       |
| (92) Strong fit for your senior TypeScri…  |
|   (no reason line on any card)             |
+--------------------------------------------+

D — save error (switch back to its previous state)
+--------------------------------------------+
| [Newest first|(Best match)]                |
| [x] Lower stale postings  [ ] Show marked  |
| ! Your realness choice was not saved.      |
|   Job-radar could not save your realness   |
|   choice just now. Try again.   [ Retry ]  |
|--------------------------------------------|
| (list unchanged)                           |
+--------------------------------------------+

E — no profile, best match first
+--------------------------------------------+
| [Newest first|(Best match)]                |
| [x] Lower stale postings  [ ] Show marked  |
| No scores yet — set up a profile. Until    |
| you set up a profile, best match first     |
| puts postings with fewer realness signals  |
| first.                                     |
|--------------------------------------------|
| Go Engineer · Example Co                   |
| Lowered: first found 47 days ago ·         |
|   reposted · no salary listed              |
+--------------------------------------------+
```

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| RealnessSwitch (`apps/web/src/features/realness/RealnessSwitch.tsx`) | MarkedToggle's switch is fixed to "Show marked postings" and is never saved. This switch is saved, so it needs a pending state and a revert-on-failure state with an error banner; it reuses MarkedToggle's markup pattern and InlineBanner | pending |
| ReasonLine (`apps/web/src/features/realness/ReasonLine.tsx`) | Badge is a short status label, and LocationCheck shows one fixed reason. The reason line is a sentence assembled from several signals, with an order-dependent prefix | pending |

**Changed existing components** (additive, registered by `implement`):
- PostingCard gains a reason slot under the match slot.
- OrderSwitch shows without a profile (Home.tsx condition).
- ScoringNotice's no-profile state gains the best-match sentence when `order` is `best_match`.
