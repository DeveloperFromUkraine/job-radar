---
status: approved
feature_size: "M"
tool: code
updated_at: "2026-10-15"
---

# Screens — match-score

> The canonical **screen manifest**: every screen in every state. `screens` produces it between `api` and `tasks`. `tasks` cites its SCR ids and states, `implement` builds to it, and `review` checks against it. Downstream reads only this manifest.

## Source

- **Tool:** code (from `docs/design-system.md`). No design-tool MCP is used.
- **File:** the wireframes are inline below and show the 360 px phone layout. From `md:` SCR-03 puts the draft and the current profile side by side, and the card keeps search-postings' second column.

States are derived from:
- spec §5: AC-01 – AC-21. AC-17 has no screen of its own: it is the access rule. AC-02 is an invariant: the counts are the same with or without scores.
- sad.md §6 flows 1–9 (`alt`/`else`/`opt` branches);
- `contracts/openapi.yaml` responses:
  - `MATCHING_INVALID_PROFILE`, `MATCHING_NOTICE_NOT_AGREED`
  - `MATCHING_CV_UNSUPPORTED` / `_NO_TEXT` / `_EMPTY` / `_TOO_LARGE`
  - `MATCHING_CAP_REACHED`, `MATCHING_DRAFT_UNUSABLE`, `MATCHING_PROVIDER_UNAVAILABLE`, `MATCHING_KEY_PROBLEM`
  - `VALIDATION_ERROR`, 500
  - the `Match.state` / `Match.stale` values and `ScoringHealth.problem.kind`;
- the ux-flows US-01 – US-06 branches and api-sync-report F-1, F-3 and F-5.

## Screens

### SCR-01 — Main screen

This is the remote-filter main screen with a match on every card, an order switch, a no-profile line, a cap-reached line, and a problem marker that also follows scoring. Every earlier SCR-01 state is unchanged unless a row below restates it: skills, the location bar, the summary, loading, list errors, show more, waiting, marks, Undo, look-alike and the check mark.

Component tree: App shell › ProblemMarker (source **or** scoring problem) › SkillsField › LocationFilterBar › NEW: OrderSwitch + MarkedToggle › NEW: ScoringNotice (no profile / cap reached) › summary line › waiting notice › PostingCard list (each with NEW: MatchSummary, then MarkActions) › show more › Undo notice.

`getScoringHealth` is read on opening, beside `GET /collector/problems`. A failure to read it shows nothing, because the list does not depend on it (F-3 spirit). The score never moves a card or changes a count (AC-02).

#### Order and notices

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| newest first | `SearchResult.order: newest`, the default for an owner who never chose (AC-11). The switch shows "Newest first" as selected | NEW: OrderSwitch | wireframe 01-a |
| best match first | `order: best_match` (AC-11). Postings with no score come first, newest first, then scored ones from high to low. The order is fixed until a refresh, and a score that arrives later shows on its card without moving it | OrderSwitch | wireframe 01-b |
| switching order | The owner picks the other order. `runSearch` runs with `order` and the list reloads from the top with SearchList's existing loading state. The choice is kept for the next opening | OrderSwitch (disabled while loading), SkeletonRow | — |
| no profile | `has_profile: false` (AC-15). One line above the list: "No scores yet — set up your profile to see how each posting fits", with the action "Set up profile" (→ SCR-03). There is no order switch, no match on any card, and the order is newest first | NEW: ScoringNotice (info), Button | wireframe 01-c |
| cap reached | `getScoringHealth.cap_reached` (AC-12). The line reads "This month's scoring cap is reached. Scoring resumes on 1 November.", with the action "Change cap" (→ SCR-03). The list, search, filter and marks work as before | ScoringNotice (warning), Button | wireframe 01-d |
| scoring problem | `getScoringHealth.problem` is set and not `cap_reached` (AC-14). The existing ProblemMarker shows and leads to SCR-02. Its text names scoring when only scoring has the problem ("Scoring has a problem — see source health") | ProblemMarker (text extended) | — |
| scores unreadable | `runSearch` is answered with `match: null` everywhere while `has_profile` is true (contract F-3, fail-open). The list shows newest first with no matches and no notice of its own; the problem shows through scoring health if it persists | SearchList (unchanged) | — |

#### NEW: MatchSummary (on each PostingCard, above the actions)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| scored | `match.state: scored`, `stale: null` (AC-01). The total "88" as a Badge toned by the score scale (`score-high` ≥ 70, `score-mid` 40–69, `score-low` < 40), the label "match", and the fit note below as plain text, never markup (AC-03). A "Details" button (44 px) opens the parts | NEW: MatchSummary, NEW: ScoreBadge, Button | wireframe 01-a |
| parts open | The owner opens Details (AC-01, AC-04). Four rows open in place: Skills / Role type / Seniority / Terms, each with a number or "not stated", followed by the claims, each as "The posting says: “visa sponsorship guaranteed”" (AC-03, AC-05). "Hide details" closes it. The location check line stays above and unchanged (AC-05) | MatchSummary (expanded) | wireframe 01-e |
| stale — posting changed | `stale: posting_changed` (AC-06). The score is shown with a muted line under it: "Scored against an earlier version of this posting" | MatchSummary, Badge (notice) | wireframe 01-b |
| stale — profile changed | `stale: profile_changed` (AC-10). "Scored against your previous profile" | MatchSummary, Badge (notice) | — |
| pending | `state: pending`. "Not scored yet — waiting its turn" in `text-muted`, with no number | MatchSummary | wireframe 01-b |
| not scored | `state: not_scored` (AC-14). "Not scored — " followed by `match.reason`, e.g. "the provider can't be reached right now" | MatchSummary | — |
| cap reached | `state: cap_reached` (AC-12). "Not scored — monthly cap reached" | MatchSummary | wireframe 01-d |
| could not be scored | `state: could_not_score` (AC-18). "Could not be scored — " followed by `match.reason`. The card stays in its place | MatchSummary | — |
| no match | `match: null` (no profile, or F-3). No MatchSummary at all | — | — |
| low score | `total` < 30 (AC-02). Shown like any score. The card is never hidden and no count changes | MatchSummary | — |

#### Marked view

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| marked with score | `MarkedPosting.match` is set (AC-13 note). The marked card shows the last score in MatchSummary, with its stale line if any. It is never re-scored, so it shows no pending state | MarkedList, PostingCard (marked), MatchSummary | — |
| marked, never scored | `match: null`. No MatchSummary | MarkedList | — |
| order switch | Hidden while the marked view is on. The marked view keeps its `marked_at` order | MarkedToggle (on) | — |

```text
01-a  newest first, scored card         01-b  best match first
+------------------------------------+  +------------------------------------+
| [ Skills: TypeScript, React ][Go]  |  | Open to 🇵🇱 Poland  [Change] ...    |
| Open to 🇵🇱 Poland  [Change] ...    |  | Order (Newest first)(•Best match)  |
| Order (•Newest first)(Best match)  |  | [ ] Show marked postings           |
| [ ] Show marked postings           |  | 130 postings · 2 new — 20 hidden   |
| 130 postings · 2 new — 20 hidden   |  | +--------------------------------+ |
| +--------------------------------+ |  | | Frontend Engineer         NEW  | |
| | Senior Fullstack Engineer      | |  | | Example Co · 1 h ago           | |
| | Example Co · 1 d ago           | |  | | Not scored yet — waiting its   | |
| | Himalayas · Europe             | |  | | turn                           | |
| | (88) match          [Details]  | |  | | [Applied]        [Skipped]     | |
| | Matches your core TypeScript   | |  | +--------------------------------+ |
| | and React at senior level...   | |  | | Staff Platform Engineer        | |
| | [Applied]        [Skipped]     | |  | | (41) match          [Details]  | |
| +--------------------------------+ |  | | Scored against an earlier      | |
+------------------------------------+  | | version of this posting        | |
                                        | +--------------------------------+ |
                                        +------------------------------------+

01-c  no profile                        01-d  cap reached
+------------------------------------+  +------------------------------------+
| No scores yet — set up your        |  | This month's scoring cap is        |
| profile to see how each posting    |  | reached. Scoring resumes on        |
| fits.            [Set up profile]  |  | 1 November.        [Change cap]    |
| 140 postings · 3 new               |  | | Backend Engineer (Go)          | |
| (cards as before, no matches)      |  | | Not scored — monthly cap       | |
+------------------------------------+  | | reached                        | |
                                        +------------------------------------+

01-e  parts open
+------------------------------------+
| | (88) match       [Hide details]| |
| | Skills       95                | |
| | Role type   100                | |
| | Seniority   100                | |
| | Terms        70                | |
| | The posting says: “visa        | |
| | sponsorship guaranteed”        | |
+------------------------------------+
```

### SCR-02 — Source health

This is the remote-boards-collector screen with a scoring health block above the sources. Every source state is unchanged.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | `getScoringHealth` in flight. One card-shaped placeholder | SkeletonRow | — |
| healthy | `problem: null` (AC-14). "Scoring" heading with these rows: last scored "5 min ago"; "$1.20 of $5.00 this month"; "3 pending · oldest 10 min"; "1 could not be scored this month" (AC-18). Pending ages come from `first_found_at` (F-5) | NEW: ScoringHealthCard, Badge (enabled "Working") | wireframe 02-a |
| provider or key problem | `problem.kind` is `provider_unreachable` / `rate_limited` / `key_missing` / `key_refused` (AC-14). Badge `problem` "Not scoring". `problem.reason` is shown as text, plus "Last scored 14 h ago". For a key problem the hint reads "Set a valid key in your local configuration and restart job-radar". The key itself is never shown | ScoringHealthCard, Badge (problem) | wireframe 02-b |
| cap reached | `problem.kind: cap_reached` (AC-12). Badge `notice` "Cap reached", the line "$4.98 of $5.00 — resumes on 1 November", and the action "Change cap" (→ SCR-03) | ScoringHealthCard, Badge (notice), Button | — |
| no profile | `pending_count: 0` and no last success while there is no profile. "Scoring starts once you set up your profile", with the action "Set up profile" | ScoringHealthCard, Button | — |
| error | `getScoringHealth` 500. The API message with Retry in the block's place. The sources still show | InlineBanner (error, Retry) | — |
| empty | N/A: the block always has figures, zeros included | — | — |

```text
02-a  healthy                           02-b  key refused
+------------------------------------+  +------------------------------------+
| Scoring                 [Working]  |  | Scoring              [Not scoring] |
| Last scored 5 min ago              |  | The language-model provider        |
| $1.20 of $5.00 this month          |  | refused job-radar's key. Set a     |
| 3 pending · oldest 10 min          |  | valid key and restart job-radar.   |
| 1 could not be scored this month   |  | Last scored 14 h ago               |
+------------------------------------+  | 42 pending · oldest 14 h           |
| (source cards as before)           |  +------------------------------------+
```

### SCR-03 — Profile

New route `/profile`, reached from "Set up profile", "Change cap" and a "Profile" link added to AppNav. It has three sections stacked on phones: **Profile** (the editor or the CV draft review), **Scoring cap**, and the one-time **data notice** step, which appears in place of the action that triggered it.

Component tree: App shell › AppNav (+ Profile) › NEW: CvUpload › NEW: ProfileForm *or* NEW: DraftReview › NEW: DataNotice (when needed) › NEW: CapField.

#### Profile editor

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | `getMatchingSettings` in flight. Card-shaped placeholders | SkeletonRow ×3 | — |
| load error | `getMatchingSettings` 500. The API message with Retry. Nothing is editable | InlineBanner (error, Retry) | — |
| empty | `profile: null` (AC-21). The heading "Set up your profile" sits above two choices: "Upload your CV" (CvUpload) or the empty form below it. The form's fields are: Skills (rows of text + a Core / Nice-to-have choice, "Add skill"); Years of experience; Seniority (select, fixed list); Role types (checkboxes, fixed list); Minimum salary (amount + currency + period hour / day / month / year, F-6); Engagement forms (checkboxes) | NEW: ProfileForm, NEW: CvUpload, Button | wireframe 03-a |
| filled | `profile` set (AC-10). The form holds the current profile, with "Save" and the line "Saving a change re-scores your postings" | ProfileForm, Button | — |
| validation | AC-16, client-side before sending (F-1). The message sits under the field in `text-danger` with `aria-invalid`, and is live once flagged: "Mark at least one skill as core", "Use 60 or fewer", "Up to 50 characters", "Choose a currency and a period", "Remove the email address — a profile holds no contact details". Nothing is sent | ProfileForm (field errors) | wireframe 03-b |
| server validation | 400 `MATCHING_INVALID_PROFILE` / `VALIDATION_ERROR` (backstop). The API message in a banner above Save; the message starts with the field's name. The profile is unchanged | InlineBanner (error) | — |
| notice needed | Save or upload with `notice_agreed_at: null` (AC-20). The DataNotice step replaces the action area | DataNotice | wireframe 03-c |
| saving | `saveProfile` in flight. Save is pending and the fields stay editable | Button (pending) | — |
| saved, changed | 200 `changed: true` (AC-10, AC-21). Back to SCR-01, where existing scores show "Scored against your previous profile" until redone | — (navigates) | — |
| saved, unchanged | 200 `changed: false`. An info banner "Nothing changed — your scores stay as they are", and the screen stays | InlineBanner (info) | — |
| save error | 500: the API message with Retry; the typed values are kept. 409 `MATCHING_NOTICE_NOT_AGREED` (the screen's notice state was out of date): the notice step shows | InlineBanner (error, Retry), DataNotice | — |

#### NEW: DataNotice (one-time step)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| shown | The first CV upload or the first profile save (AC-20). Text: "To score postings, job-radar sends to Anthropic's Claude API: your CV's text once, to draft your profile (contact details removed first), then your profile and each posting's text with every scoring. Never your name or contact details." A link to the provider's terms, then "Agree and continue" and "Not now" | NEW: DataNotice, Button ×2 | wireframe 03-c |
| agreeing | `agreeNotice` in flight. The button is pending | Button (pending) | — |
| agreed | 200: the triggering action (save or upload) continues at once | — | — |
| declined | "Not now". Back to the editor with nothing sent, nothing saved and the CV unread | — | — |
| error | `agreeNotice` 500. The API message with Retry | InlineBanner (error, Retry) | — |

#### NEW: CvUpload and NEW: DraftReview

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| idle | "Upload your CV": a native file input (`accept=".pdf,.docx,.txt"`) in a 44 px labelled button, with the line "PDF, Word (.docx) or text, up to 5 MB" | NEW: CvUpload | wireframe 03-a |
| client refusal | Over 5 MB or an unsupported kind, checked before sending (sad.md §8). The message sits under the button: "This file is larger than 5 MB…" / "This kind of file can't be read…". Nothing is sent | CvUpload (error) | — |
| drafting | `draftProfileFromCv` in flight (up to 60 s, spec §6). The button is pending with "Reading your CV…" and the rest of the screen stays usable | Button (pending) | — |
| unreadable | 400 `MATCHING_CV_UNSUPPORTED` / `_NO_TEXT` / `_EMPTY`, or 413 `MATCHING_CV_TOO_LARGE` (AC-08). The API message under the button; the profile is unchanged | CvUpload (error) | — |
| draft refused | 409 `MATCHING_CAP_REACHED` (AC-08). The message and the action "Change cap" | InlineBanner (warning), Button | — |
| provider problem | 503 `MATCHING_PROVIDER_UNAVAILABLE` / `MATCHING_KEY_PROBLEM`, or 502 `MATCHING_DRAFT_UNUSABLE` (AC-08). The message, "Upload again later", and the form below still usable by hand | InlineBanner (error) | — |
| draft ready | 200 (AC-07, AC-09). DraftReview replaces the form. Each field shows the draft's value with a tag: "from your CV" / "not found in your CV"; for `not_mapped`, "not mapped: Solutions Architect". "Your current profile" is shown beside it from `md:` and below it on phones (collapsed, "Show current profile"). A notice reads "Removed before anything was sent: your name, email, phone, 1 link" (`removed`). Then "Use this profile" and "Discard". Fields can be corrected before using it | NEW: DraftReview, Badge (notice), InlineBanner (info), Button ×2 | wireframe 03-d |
| draft confirmed | "Use this profile" runs `saveProfile` (the core-skill rule applies, so validation states can show). On 200, back to SCR-01 | ProfileForm states | — |
| draft discarded | "Discard". The current profile is unchanged, and the draft is gone (it was never stored) | — | — |

#### NEW: CapField

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | "Monthly scoring cap" as a $ amount input (0–100, cents allowed), with "Spent this month: $4.98" and "Save cap". A hint reads "$0 pauses scoring. Also set a spending limit in your provider account." (spec §6.1) | NEW: CapField, Button | wireframe 03-e |
| validation | Outside $0–$100 or not a number. "Use an amount from $0 to $100" under the input; nothing is sent | CapField (error) | — |
| saving | `setScoringCap` in flight. The button is pending | Button (pending) | — |
| saved | 200 (AC-19). "Saved — scoring resumes" when the cap is above the spend; "Saved — scoring stays stopped until 1 November" at or below it; "Saved — scoring paused" at $0 | InlineBanner (info) | — |
| error | 400 `VALIDATION_ERROR` / 500. The API message with Retry; the cap is unchanged | InlineBanner (error, Retry) | — |

```text
03-a  empty profile                     03-b  validation
+------------------------------------+  +------------------------------------+
| Set up your profile                |  | Skills                             |
| [ Upload your CV ]                 |  | [ TypeScript   ] (Core)(Nice)      |
| PDF, Word (.docx) or text, ≤ 5 MB  |  | Mark at least one skill as core.   |
| — or fill it in —                  |  | Minimum salary                     |
| Skills                             |  | [ 6000 ][ --- ][ --- ]             |
| [            ] (Core)(Nice-to-have)|  | Choose a currency and a period.    |
| [Add skill]                        |  | [Save]                             |
| Years of experience [   ]          |  +------------------------------------+
| Seniority [ choose…        v]      |
| Role types [ ]backend [ ]frontend… |
| Minimum salary [    ][EUR][month]  |
| Engagement [ ]employment [ ]B2B …  |
| [Save]                             |
+------------------------------------+

03-c  data notice                       03-d  draft ready (phone)
+------------------------------------+  +------------------------------------+
| Before anything leaves your laptop |  | Draft from your CV                 |
| To score postings, job-radar sends |  | Removed before anything was sent:  |
| to Anthropic's Claude API: your    |  | your name, email, phone, 1 link.   |
| CV's text once, then your profile  |  | Skills  TypeScript (core), React   |
| and each posting's text with every |  |  (core), GraphQL   [from your CV]  |
| scoring. Never your name or        |  | Years   8          [from your CV]  |
| contact details.  Provider terms › |  | Role types fullstack               |
| [Agree and continue] [Not now]     |  |  not mapped: Solutions Architect   |
+------------------------------------+  | Salary  —     [not found in CV]    |
                                        | [Show current profile]             |
03-e  scoring cap                       | [Use this profile] [Discard]       |
+------------------------------------+  +------------------------------------+
| Monthly scoring cap  $[ 5.00 ]     |
| Spent this month: $4.98            |
| $0 pauses scoring. Also set a      |
| spending limit in your provider    |
| account.            [Save cap]     |
+------------------------------------+
```

Every action on all three screens is at least 44×44 px. On phones, segmented options and checkbox groups wrap with `gap-2` and never scroll sideways (spec §6 Phone layout).

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| ScoreBadge | Badge's tones are statuses (enabled, problem, notice, new). A score needs the three `score-*` tokens chosen by value, and a number with an accessible label ("Match 88 out of 100"). It could be a Badge tone, but the value-to-tone rule belongs with the score | pending |
| MatchSummary | No component shows a value, a plain-text note, an expandable detail and five alternative states. PostingCard gains it through its existing slot pattern (additive prop), like the check line | pending |
| OrderSwitch | MarkedToggle is an on/off switch. The order is a choice between two named options, so a native radio group styled as a segmented control is needed, with 44 px options | pending |
| ScoringNotice | InlineBanner covers the look (info / warning). This is a thin wrapper that picks the no-profile or cap-reached text and action from health and settings, so SearchList need not know scoring. It composes InlineBanner and Button | pending |
| ScoringHealthCard | SourceCard is bound to one source's flags and runs. Scoring has spend, pending, age and a problem with a reason. It composes Badge, Button and InlineBanner | pending |
| ProfileForm | No form exists beyond the single-input SkillsField and CountryChoice. It has seven fields with fixed lists, a repeatable skill row and field-level errors, and follows SkillsField's error pattern (`aria-describedby`, `aria-invalid`) | pending |
| CvUpload | No file input exists. It is a native `<input type="file">` behind a labelled 44 px button, with client-side kind and size checks | pending |
| DraftReview | It shows a proposed profile with per-field provenance tags beside the current one. ProfileForm is for editing; this view is for comparing. It reuses ProfileForm's fields for corrections | pending |
| DataNotice | It is a consent step that blocks the triggering action until agreed. InlineBanner is non-blocking and has a single action | pending |
| CapField | It is a money input with the month's spend and a three-way saved message. It is too specific for a generic input, and composes Button and InlineBanner | pending |

Extended, not new:
- **ProblemMarker:** also shows for a scoring problem, with its text naming scoring.
- **AppNav:** gains a Profile link.
- **PostingCard:** gains a match slot.
- **SearchList:** order switch placement; the scores-unreadable case changes nothing visible.
