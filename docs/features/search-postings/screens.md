---
status: draft
feature_size: "S"
tool: code
updated_at: "2026-10-05"
---

# Screens — search-postings

> The canonical **screen manifest**: every screen in every state. `screens` produces it between `api` and `tasks`. `tasks` cites its SCR ids and states, `implement` builds to it, and `review` checks against it. Downstream reads only this manifest.

## Source

- **Tool:** code (from `docs/design-system.md`). No design-tool MCP is used.
- **File:** the wireframes are inline below. They show the 360 px phone layout; from `md:` the card body gains a second column (time and sources to the right), with no other layout change.

States are derived from:
- spec §5 AC-01 – AC-16
- sad.md §6 flows 1–5 (`alt`/`else` branches)
- `contracts/openapi.yaml` error responses
- the ux-flows US-01 – US-07 branches

## Screens

### SCR-01 — Main screen

The skills field and the list of open postings, with the feed shown when no skills are entered. The collector's problem marker stays on top, unchanged. Component tree: App shell › ProblemMarker (when flagged) › SkillsField › summary line › WaitingNotice › PostingCard list › show-more.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | The screen opens. `openVisit`, then the first `runSearch`, are in flight (flow 1) | App shell, NEW: SkillsField (input and Button disabled), SkeletonRow ×3 | wireframe 01-b |
| default | `runSearch` 200 with `total > 0` and skills entered. The summary reads "130 postings · 3 new"; cards are newest first with matched-skill chips (AC-01, AC-06, AC-14, AC-15) | App shell, NEW: SkillsField, NEW: PostingCard ×≤50, Button "Show 50 more" (only when `has_next`) | wireframe 01-a |
| feed | Empty skills field (AC-10, US-04). The summary reads "412 open postings · 3 new", with no skill chips on any card | as default | as 01-a, no chips |
| first visit | `previous_visit_started_at: null` (AC-14). No "· N new" in the summary and no New badges | as default | as 01-a |
| searching | The owner resubmits while a list is shown (flow 3). The list on screen stays until the answer arrives | NEW: SkillsField (Button pending) | as 01-a |
| validation | 400 `SEARCH_INVALID_SKILLS` (AC-05). The API message sits under the field in `text-danger`, and the list on screen is unchanged. After that it re-checks on each submit only (design-system validation rule: no live re-check, because the rules need server parsing) | NEW: SkillsField (error) | wireframe 01-c |
| empty: nothing matches | 200 `total: 0`, `collection_empty: false` (AC-11). "Nothing matches React, Go." plus one action, "Clear skills", which empties the field and runs the feed | Button "Clear skills" | wireframe 01-d |
| empty: collection empty | 200 `collection_empty: true` (AC-11). "The first collection hasn't brought postings yet." with an "Open source health" link to SCR-02, plus "Clear skills" when skills were used | InlineBanner (info), Button "Clear skills" (only with skills) | wireframe 01-d′ |
| error | `runSearch` 503 `SEARCH_COLLECTION_UNAVAILABLE` / 500 / 403 / 415, or `openVisit` fails (AC-12, flow 3). The API message shows with Retry. The skills stay in the field and the last list stays visible below. Retry repeats the failed call | InlineBanner (error, Retry) | wireframe 01-c |
| show more: pending | `getNextPage` in flight (AC-15) | Button "Show 50 more" (pending) | — |
| show more: error | `getNextPage` 503 / 500 (AC-12, flow 5). The banner sits under the list, the postings already shown stay, and Retry sends the same cursor | InlineBanner (error, Retry) | wireframe 01-e |
| show more: done | `has_next: false`. The button is gone (US-07 → Z) | — | as 01-a, no button |
| list expired | `getNextPage` 410 `SEARCH_SNAPSHOT_EXPIRED` (ADR-0003). The web re-runs `runSearch`, the list reloads from the newest, and "This list had expired and was reloaded from the newest." shows above it | InlineBanner (info) | — |
| waiting | `getWaitingCount` 200 with `waiting_count > 0` (AC-16, flow 2). "4 new postings are waiting." with a Refresh action. Refresh = `runSearch` with the field's skills and clears the notice. Poll errors (410 / 503 / 500) show nothing (contract) | InlineBanner (info, action "Refresh"; extended) | wireframe 01-e |
| problem | Collector `has_problem: true`. Unchanged (collector screens.md 01-b) | ProblemMarker | collector 01-b |

#### NEW: SkillsField

| State | Trigger | Look |
|---|---|---|
| idle | default | A label "Your skills", a text input with the placeholder "React, TypeScript, Go" and the hint "Separate skills with commas.", and a Button "Search". Enter submits |
| pending | a search is in flight | The Button is pending and the input stays editable |
| error | 400 `SEARCH_INVALID_SKILLS` | The message is under the input in `text-danger`, linked by `aria-describedby`, and the input has `aria-invalid` |

The field is prefilled from `openVisit.last_skills` joined with ", " (AC-13). On phones the input and button stack, full width.

#### NEW: PostingCard

| Part | Rule | Source |
|---|---|---|
| Title, company | Plain text only. Title is `font-medium`, company is `text-text-muted` | AC-07, AC-09 |
| New mark | Badge (tone `new`, extended) "New" when `is_new` | AC-14 |
| Time | "Published 2 d ago", using `<time datetime>` with the absolute UTC date in `title`. When `published_at` is null: "Publication time unknown · first seen 3 Oct" | AC-03, AC-07 |
| Matched skills | One Badge (tone `notice`) per `matched_skills` entry, in the owner's spelling and search order. An in-title match reads "React · title"; no chips in the feed. The chips are never highlighted inside the title | AC-06, AC-10, sad.md §8 |
| Sources | One row per listing: the source name (`SOURCE_NAMES`, falling back to the raw `source_id`) followed by " — " and the location restriction, or "unknown" when it's null. The name renders in one of three ways: (a) open listing with a `url`: an `<a target="_blank" rel="noopener noreferrer">` with a 44 px tall target; (b) `status: closed`: plain name plus "closed at <Source>" in `text-text-muted`, no link; (c) open listing with `url: null`: plain name, no link | AC-07, AC-08, AC-09 |

The whole card is not a link; only the source names are. Every action target is at least 44×44 px, and there is no horizontal scroll at 360 px (spec §6).

```text
wireframe 01-a — default (360 px)
+--------------------------------------+
| job-radar        Home  Source health |  AppNav
|--------------------------------------|
| Your skills                          |  SkillsField
| [React, TypeScript                 ] |
| Separate skills with commas.         |
| [            Search                ] |
|                                      |
| 130 postings · 3 new                 |  summary
| +----------------------------------+ |
| | Senior React Engineer      (New) | |  PostingCard
| | Example Co                       | |
| | Published 2 d ago                | |
| | (React · title) (TypeScript)     | |
| | Jobicy — Europe              ↗   | |  linked, new tab
| | Himalayas — unknown              | |
| |   closed at Himalayas            | |
| +----------------------------------+ |
| +----------------------------------+ |
| | Full-stack Developer (Node.js)   | |
| | Example Co                       | |
| | Publication time unknown ·       | |
| | first seen 3 Oct                 | |
| | (TypeScript)                     | |
| | Remotive — Worldwide             | |  open, unsafe link → name only
| +----------------------------------+ |
|  …                                   |
| [         Show 50 more             ] |
+--------------------------------------+
```

```text
wireframe 01-b — loading
+--------------------------------------+
| job-radar        Home  Source health |
|--------------------------------------|
| Your skills                          |
| [                                  ] |  disabled
| [            Search                ] |  disabled
| ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ |  SkeletonRow ×3
| ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ |
| ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ |
+--------------------------------------+
```

```text
wireframe 01-c — validation (left) / error (right): both keep the last list below
+-----------------------------+  +-----------------------------+
| Your skills                 |  | Your skills                 |
| [React, --                ] |  | [React, Go                ] |
| "--" needs at least one     |  | [         Search          ] |
|  letter or digit.  (danger) |  | ┌─────────────────────────┐ |
| [         Search          ] |  | │ Couldn't load postings. │ |  InlineBanner error
|                             |  | │ Job-radar could not read│ |
| 130 postings · 3 new        |  | │ its postings just now.  │ |
| [ last list unchanged … ]   |  | │            [ Retry ]    │ |
|                             |  | └─────────────────────────┘ |
|                             |  | [ last list unchanged … ]   |
+-----------------------------+  +-----------------------------+
```

```text
wireframe 01-d — nothing matches      wireframe 01-d′ — collection empty
+-----------------------------+  +-----------------------------+
| Your skills                 |  | Your skills                 |
| [Haskell, Elm             ] |  | [                         ] |
| [         Search          ] |  | [         Search          ] |
|                             |  | ┌─────────────────────────┐ |
| Nothing matches Haskell,    |  | │ The first collection    │ |  InlineBanner info
| Elm.                        |  | │ hasn't brought postings │ |
| [       Clear skills      ] |  | │ yet. Open source health │ |  link → SCR-02
|                             |  | └─────────────────────────┘ |
+-----------------------------+  +-----------------------------+
```

```text
wireframe 01-e — waiting notice (top) and show-more error (bottom)
+--------------------------------------+
| 130 postings · 3 new                 |
| ┌──────────────────────────────────┐ |
| │ 4 new postings are waiting.      │ |  InlineBanner info
| │                     [ Refresh ]  │ |
| └──────────────────────────────────┘ |
| [ PostingCard … ×50 ]                |
| ┌──────────────────────────────────┐ |
| │ Couldn't load more postings.     │ |  InlineBanner error
| │ …API message…        [ Retry ]   │ |
| └──────────────────────────────────┘ |
+--------------------------------------+
```

### SCR-02 — Source health

Unchanged from remote-boards-collector (collector screens.md SCR-02, all states). This feature only adds an entry point: the "Open source health" link in SCR-01's *empty: collection empty* state.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default, loading, empty, error, … | N/A: unchanged by this feature (collector screens.md SCR-02) | SourceCard, RunProgress, CollectNowAction, InlineBanner, SkeletonRow | collector 02-a – 02-g |

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| SkillsField | The inventory has no text input or form primitive. It composes Button and adds a label, hint and field-level error | pending |
| PostingCard | SourceCard is specific to source health. A posting needs title, company, time, skill chips and per-source links with closed and unsafe variants. It composes Badge | pending |

**Extended primitives.** These are additive props that don't change existing call sites. `implement` updates the inventory rows.

| Primitive | Extension | Why |
|---|---|---|
| InlineBanner | An optional `action: { label, onClick }` next to `onRetry` (the action label is currently fixed to "Retry") | The waiting notice needs a "Refresh" action (AC-16) |
| Badge | Tone `new` (`bg-accent text-accent-contrast`) | The "New" mark must stand out from the skill chips (AC-14). Existing tokens only, so no new token is needed |
