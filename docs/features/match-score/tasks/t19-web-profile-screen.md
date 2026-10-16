---
id: T19
title: "Build the profile screen: route, AppNav link, ProfileForm, DataNotice and CapField"
layer: "ui"
deps: ["T16"]
blocks: ["T20"]
acs: ["AC-10", "AC-16", "AC-19", "AC-20", "AC-21"]
files_hint: ["apps/web/src/routes/Profile.tsx", "apps/web/src/App.tsx", "apps/web/src/components/AppNav.tsx", "apps/web/src/features/matching/ProfileForm.tsx", "apps/web/src/features/matching/DataNotice.tsx", "apps/web/src/features/matching/CapField.tsx", "apps/web/src/features/matching/profile-rules.ts"]
owner: "Volodymyr Kozlov"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T19 — Build the profile screen: route, AppNav link, ProfileForm, DataNotice and CapField

## Place in the sequence

- **Blocked by:** T16 — Show the match on every card: API types, ScoreBadge and MatchSummary in the main list and the marked view · **Blocks:** T20 — Add CV upload and the draft review to the profile screen · **Wave:** 2.
- **Lane:** shares `apps/web/src/routes/Profile.tsx` with T20 — serialized.

## Why (user story)

> **As an** owner
> **I want** to edit my profile at any time and have scores follow the change
> **So that** the scores reflect what I am looking for now
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** scoring to stop at a monthly cap I can see
> **So that** job-radar never costs me more than I agreed to
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The screen where the owner sets up or edits the profile, agrees to the notice once, and sets the cap.

## Inlined context

> | loading | `getMatchingSettings` in flight. Card-shaped placeholders | SkeletonRow ×3 | — |
> | load error | `getMatchingSettings` 500. The API message with Retry. Nothing is editable | InlineBanner (error, Retry) | — |
> | empty | `profile: null` (AC-21). The heading "Set up your profile" sits above two choices: "Upload your CV" (CvUpload) or the empty form below it. The form's fields are: Skills (rows of text + a Core / Nice-to-have choice, "Add skill"); Years of experience; Seniority (select, fixed list); Role types (checkboxes, fixed list); Minimum salary (amount + currency + period hour / day / month / year, F-6); Engagement forms (checkboxes) | NEW: ProfileForm, NEW: CvUpload, Button | wireframe 03-a |
> | filled | `profile` set (AC-10). The form holds the current profile, with "Save" and the line "Saving a change re-scores your postings" | ProfileForm, Button | — |
> | validation | AC-16, client-side before sending (F-1). The message sits under the field in `text-danger` with `aria-invalid`, and is live once flagged: "Mark at least one skill as core", "Use 60 or fewer", "Up to 50 characters", "Choose a currency and a period", "Remove the email address — a profile holds no contact details". Nothing is sent | ProfileForm (field errors) | wireframe 03-b |
> | server validation | 400 `MATCHING_INVALID_PROFILE` / `VALIDATION_ERROR` (backstop). The API message in a banner above Save; the message starts with the field's name. The profile is unchanged | InlineBanner (error) | — |
> | notice needed | Save or upload with `notice_agreed_at: null` (AC-20). The DataNotice step replaces the action area | DataNotice | wireframe 03-c |
> | saving | `saveProfile` in flight. Save is pending and the fields stay editable | Button (pending) | — |
> | saved, changed | 200 `changed: true` (AC-10, AC-21). Back to SCR-01, where existing scores show "Scored against your previous profile" until redone | — (navigates) | — |
> | saved, unchanged | 200 `changed: false`. An info banner "Nothing changed — your scores stay as they are", and the screen stays | InlineBanner (info) | — |
> | save error | 500: the API message with Retry; the typed values are kept. 409 `MATCHING_NOTICE_NOT_AGREED` (the screen's notice state was out of date): the notice step shows | InlineBanner (error, Retry), DataNotice | — |
>
> — `screens.md §SCR-03, Profile editor, verbatim` · full text: [screens.md](../screens.md)

> | shown | The first CV upload or the first profile save (AC-20). Text: "To score postings, job-radar sends to Anthropic's Claude API: your CV's text once, to draft your profile (contact details removed first), then your profile and each posting's text with every scoring. Never your name or contact details." A link to the provider's terms, then "Agree and continue" and "Not now" | NEW: DataNotice, Button ×2 | wireframe 03-c |
> | agreeing | `agreeNotice` in flight. The button is pending | Button (pending) | — |
> | agreed | 200: the triggering action (save or upload) continues at once | — | — |
> | declined | "Not now". Back to the editor with nothing sent, nothing saved and the CV unread | — | — |
> | error | `agreeNotice` 500. The API message with Retry | InlineBanner (error, Retry) | — |
>
> — `screens.md §SCR-03, DataNotice, verbatim` · full text: [screens.md](../screens.md)

> | default | "Monthly scoring cap" as a $ amount input (0–100, cents allowed), with "Spent this month: $4.98" and "Save cap". A hint reads "$0 pauses scoring. Also set a spending limit in your provider account." (spec §6.1) | NEW: CapField, Button | wireframe 03-e |
> | validation | Outside $0–$100 or not a number. "Use an amount from $0 to $100" under the input; nothing is sent | CapField (error) | — |
> | saving | `setScoringCap` in flight. The button is pending | Button (pending) | — |
> | saved | 200 (AC-19). "Saved — scoring resumes" when the cap is above the spend; "Saved — scoring stays stopped until 1 November" at or below it; "Saved — scoring paused" at $0 | InlineBanner (info) | — |
> | error | 400 `VALIDATION_ERROR` / 500. The API message with Retry; the cap is unchanged | InlineBanner (error, Retry) | — |
>
> — `screens.md §SCR-03, CapField, verbatim` · full text: [screens.md](../screens.md)

> - **F-1 (accepted):** the profile field error stays in the repo envelope. The web checks AC-16's rules before sending and marks the field itself. The server's `MATCHING_INVALID_PROFILE` message starts with the field's name, as the backstop. `tasks`: the rules live in two places (web and `matching/domain`), so they should share one table-driven test.
>
> — `contracts/api-sync-report.md §Findings, F-1, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

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

`getMatchingSettings`, `saveProfile`, `agreeNotice`, `setScoringCap` (see T08). Errors shown: `MATCHING_INVALID_PROFILE` (message starts with the field), `MATCHING_NOTICE_NOT_AGREED`, `VALIDATION_ERROR`, 500.

— `contracts/openapi.yaml, operationIds getMatchingSettings / saveProfile / agreeNotice / setScoringCap, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-10 — happy

> **Given** 60 postings in the owner's list have scores, and the owner changes their seniority from senior to staff and saves the profile
> **When** the owner returns to the list
> **Then** every existing score stays shown, marked "scored against your previous profile", until its posting is scored again; they are scored again newest first within the scoring cap (AC-12), after every posting that has no score at all; and "best match first" uses the new scores from the next time the list is loaded or refreshed (AC-11)
>
> > Only a saved change to a profile field makes scores stale: skills or their core / nice-to-have mark, years, seniority, role types, minimum salary or engagement forms. Saving with nothing changed, or changing the scoring cap, makes nothing stale.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — error

> **Given** the owner is editing their profile
> **When** they try to save it with no core skill, a negative or non-numeric minimum salary, a salary without a currency or period, years of experience above 60, a skill longer than 50 characters, or an email address, phone number or web address in any field
> **Then** the profile is not saved, the owner sees which field is wrong and what it must be, and the existing profile and scores stay unchanged
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy

> **Given** this month's scoring has stopped at the $5 cap on the 20th
> **When** the owner raises the scoring cap to $8 in the profile editor
> **Then** scoring resumes at once, newest first, until this month's spending reaches $8; lowering the cap below what is already spent stops scoring until next month, and a cap of $0 pauses scoring; the cap can be set from $0 to $100
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — domain invariant

> **Given** nothing has ever been sent to the language-model provider
> **When** the owner uploads a CV for the first time, or confirms a profile for the first time
> **Then** before anything leaves the machine, the owner sees what will be sent and to whom — the CV text once to draft the profile; the profile and each posting's text with every scoring; never a name or contact detail — and nothing is sent until the owner agrees, once; declining leaves the profile unsaved or the CV unread and nothing is sent
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — happy

> **Given** the owner has no profile and no CV at hand
> **When** they fill in the profile by hand — core and nice-to-have skills, years, seniority, role types, minimum salary with currency and period, engagement forms — and save it
> **Then** the profile is saved, nothing but the profile is sent to the provider, and the postings in the list are scored newest first within the cap (AC-13)
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `/profile` route in `App.tsx`; Profile link in `AppNav`
- [ ] `profile-rules.ts`: the same AC-16 table as the server's `domain/profile.ts` (shared test table, F-1)
- [ ] `ProfileForm.tsx`: seven fields, skill rows with Core/Nice-to-have, field errors under each field
- [ ] `DataNotice.tsx`: blocks the triggering action; agree continues it, "Not now" sends nothing
- [ ] `CapField.tsx`: $ input → cents, the three saved messages
- [ ] Tests per state; 360 px layout without sideways scroll

## Edge cases

| Case | Behaviour |
|---|---|
| No core skill | "Mark at least one skill as core" under Skills; nothing sent |
| First save, notice never agreed | notice step; "Not now" leaves the form unsaved |
| Saved with nothing changed | "Nothing changed — your scores stay as they are" |
| Cap 100.01 | "Use an amount from $0 to $100"; nothing sent |

## Definition of Done

**Done when:** Testing Library tests pass for every SCR-03 Profile editor, DataNotice and CapField state, and the web rule table matches the server's AC-16 cases.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
