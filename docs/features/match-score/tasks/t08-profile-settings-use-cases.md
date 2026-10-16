---
id: T08
title: "Implement the settings use cases: read settings, save profile, agree to the notice, set the cap"
layer: "app"
deps: ["T02", "T05"]
blocks: ["T15"]
acs: ["AC-10", "AC-16", "AC-19", "AC-20", "AC-21"]
files_hint: ["apps/server/src/modules/matching/app/settings.ts", "apps/server/src/modules/matching/app/deps.ts", "apps/server/test/matching-settings.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T08 — Implement the settings use cases: read settings, save profile, agree to the notice, set the cap

## Place in the sequence

- **Blocked by:** T02 — Write the profile rules: fixed lists, field checks, contact detection, change detection and salary periods, T05 — Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction · **Blocks:** T15 — Expose matching's routes and wire the module into app.ts · **Wave:** 3.
- **Lane:** own lane.

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

Everything the profile screen saves, with the notice guard and the rule that only a real change makes scores stale.

## Inlined context

> ### Flow 4: saving the profile by hand or after an edit (AC-10, AC-16, AC-20, AC-21; ADR-0005)
>
> ```mermaid
> sequenceDiagram
>     autonumber
>     actor O as user (owner)
>     participant U as ui (profile screen SCR-03)
>     participant M as service (matching)
>     participant D as data-store
>     participant SC as service (matching scorer)
>
>     Note over O,M: Precondition: the profile screen is open with an empty or the current profile
>     O->>U: fills in or edits the fields and saves
>     U->>U: checks the fields before sending
>     alt the data notice was never agreed
>         U-->>O: data notice - the profile and each posting's text go to the LLM provider with every scoring, never a name or contact
>         alt owner declines
>             O->>U: declines
>             U-->>O: back to the editor, profile not saved, nothing sent
>         else owner agrees
>             O->>U: agrees
>             U->>M: record agreement
>             M->>D: notice agreed at
>             Note over M,D: persists the notice agreement (once)
>         end
>     end
>     U->>M: save profile
>     M->>M: validate - a core skill, salary with currency and period, years 0 to 60, skills up to 50 characters, no email, phone or web address in any field
>     alt a field is invalid
>         M-->>U: which field is wrong and what it must be
>         U-->>O: field error, profile and scores unchanged
>     else notice not agreed (guard)
>         M-->>U: refused, nothing saved or sent
>     else valid
>         M->>D: current profile and version
>         D-->>M: current profile
>         alt no profile field changed
>             M-->>U: saved, nothing becomes stale, nothing re-scored
>         else first profile or a profile field changed
>             M->>D: replace profile, bump profile version
>             Note over M,D: persists the profile and its version - scores with an older version now read as stale
>             M->>SC: wake
>             M-->>U: saved
>             U-->>O: back to the main screen, existing scores marked scored against your previous profile
>             Note over SC,D: postings with no score first, then stale ones, newest first, within the cap (flow 1)
>         end
>     end
>     Note over O,M: Postcondition: a saved profile holds no name or contact detail, and best match first uses new scores from the next load or refresh
> ```
>
> — `sad.md §6, Flow 4, verbatim` · full text: [sad.md](../sad.md)

> The owner fills in or edits the profile and saves. If the data notice was never agreed, the screen shows it first. Declining returns to the editor with nothing saved or sent. Agreeing records the agreement once. Matching validates every field. An invalid field comes back named, with what it must be, and the profile and scores stay unchanged. Matching also refuses a save without an agreement, as a guard. A valid save that changes no profile field makes nothing stale. A first profile, or a real change, replaces the profile and bumps its version, which makes every score stale, and wakes the scorer. On the main screen, existing scores keep showing, marked "scored against your previous profile". The scorer redoes them after the postings that have no score.
>
> — `sad.md §6, Flow 4 prose, verbatim` · full text: [sad.md](../sad.md)

> The owner sets a new cap on the profile screen. A value outside $0–$100 is refused and the cap stays as it was. A valid cap is saved, which makes no score stale. Matching then compares the cap with this month's spend. If the cap is above it, the scorer wakes and resumes newest first until the next attempt no longer fits. If the cap is at or below the spend, or is $0, scoring stays stopped until next month, or paused. The screen shows the cap beside this month's spend.
>
> — `sad.md §6, Flow 6 prose, verbatim` · full text: [sad.md](../sad.md)

> | Personal data | CV text never stored; contact details removed before sending (AC-09) and rejected on save (AC-16); profile holds no name or contact detail; nothing sent before the one-time notice is agreed (AC-20) | ADR-0007, spec §6.1 |
>
> — `sad.md §8, Personal data, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Reads/writes `matching_settings.profile`, `profile_version` (+1 only on a real change), `profile_saved_at`, `cap_usd_micros`, `notice_agreed_at`; reads the month's spend from `matching_spend` (T05).

— `data-model.md §Entities, matching_settings, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `getMatchingSettings` → `MatchingSettings { profile|null, profile_version, cap_usd_cents, spent_usd_cents, notice_agreed_at|null }`
- `saveProfile { profile }` → `SaveProfileResult { changed, settings }` · `400 MATCHING_INVALID_PROFILE` · `409 MATCHING_NOTICE_NOT_AGREED`
- `agreeNotice {}` → `{ notice_agreed_at }`
- `setScoringCap { cap_usd_cents 0–10000 }` → `MatchingSettings`

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

- [ ] `app/deps.ts`: `MatchingDeps { db, clock, config, wakeScorer }`
- [ ] `app/settings.ts`: `getSettings`, `saveProfile` (notice guard → 409; `validateProfile` → 400 with the first error's message; `profileChanged` → bump version + `wakeScorer()`), `agreeNotice`, `setCap` (save; wake when the cap is above spend)
- [ ] `apps/server/test/matching-settings.integration.test.ts` with a fake `wakeScorer` spy

## Edge cases

| Case | Behaviour |
|---|---|
| Save before the notice was agreed | 409, nothing saved |
| Save with nothing changed | `changed: false`, version unchanged, scorer not woken |
| First profile | version 0 → 1, scorer woken (AC-21) |
| Cap raised above spend | scorer woken (AC-19) |
| Cap at or below spend, or $0 | saved; scorer not woken |

## Definition of Done

**Done when:** `matching-settings.integration.test.ts` passes every edge-case row plus AC-10 (senior → staff bumps the version) and AC-21 (first profile by hand wakes the scorer).

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
