---
id: T02
title: "Write the profile rules: fixed lists, field checks, contact detection, change detection and salary periods"
layer: "domain"
deps: []
blocks: ["T06", "T08", "T09"]
acs: ["AC-09", "AC-10", "AC-16"]
files_hint: ["apps/server/src/modules/matching/domain/profile.ts", "apps/server/src/modules/matching/domain/profile.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T02 — Write the profile rules: fixed lists, field checks, contact detection, change detection and salary periods

## Place in the sequence

- **Blocked by:** — · **Blocks:** T06 — Add the Claude client: SDK, configuration, fixed output schemas, usage, error classes and a stand-in provider, T08 — Implement the settings use cases: read settings, save profile, agree to the notice, set the cap, T09 — Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to edit my profile at any time and have scores follow the change
> **So that** the scores reflect what I am looking for now
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The pure rules that decide whether a profile may be saved, whether a save makes scores stale, and what counts as a contact detail.

## Inlined context

> - Profile — the owner's short, editable description of what they are looking for, used only to work out match scores: skills each marked core or nice-to-have (free text, up to 50 characters each), years of experience, seniority (one of junior, mid, senior, lead, staff, principal), wanted role types (from backend, frontend, fullstack, mobile, devops/SRE, data, ML/AI, QA, security, engineering management), minimum salary (gross amount with currency and period) and preferred engagement forms (from employment, B2B, contract/freelance); it can be drafted from an uploaded CV and always holds no name or contact details. NOT the typed skills (which decide which postings are in the list) and NOT the CV (the document it may be drafted from, which is not kept).
>
> — `CONTEXT.md §Glossary, Profile, verbatim` · full text: [CONTEXT.md](../../../../CONTEXT.md)

> > Only a saved change to a profile field makes scores stale: skills or their core / nice-to-have mark, years, seniority, role types, minimum salary or engagement forms. Saving with nothing changed, or changing the scoring cap, makes nothing stale.
>
> — `spec.md §5, AC-10 note, verbatim` · full text: [spec.md](../spec.md)

> | `profile` | text | | JSON: `{ skills: [{ name, core }], years, seniority, roleTypes[], minSalary: { amount, currency, period }, engagementForms[] }`, with the fixed lists from CONTEXT: Profile. It is checked in `matching/domain` (AC-16) and never holds a name or contact detail (AC-09). `NULL` means no profile yet (AC-15). It is one JSON value because the profile is only ever read and replaced whole (AC-07: confirming replaces the whole profile). |
>
> — `data-model.md §Entities, matching_settings.profile, verbatim` · full text: [data-model.md](../data-model.md)

> - **F-1 (accepted):** the profile field error stays in the repo envelope. The web checks AC-16's rules before sending and marks the field itself. The server's `MATCHING_INVALID_PROFILE` message starts with the field's name, as the backstop. `tasks`: the rules live in two places (web and `matching/domain`), so they should share one table-driven test.
>
> — `contracts/api-sync-report.md §Findings, F-1, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> - **F-6 (accepted):** the salary period is `hour | day | month | year`, and the currency is an ISO 4217 code. The conversion factors between periods are fixed in `matching/domain` (`tasks`), with one unit test over the table.
>
> — `contracts/api-sync-report.md §Findings, F-6, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> - Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`; a module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, layering, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. (The profile is stored as one JSON value by T05; this task only defines its shape and rules.)

## API contract

Mirrors the contract's `Profile` schema: `skills[] {name ≤50, core}` (1–50 items), `years` 0–60 or null, `seniority` (junior|mid|senior|lead|staff|principal) or null, `role_types[]` (backend|frontend|fullstack|mobile|devops_sre|data|ml_ai|qa|security|engineering_management), `min_salary {amount ≥0 integer, currency ISO 4217, period hour|day|month|year}` or null, `engagement_forms[]` (employment|b2b|contract_freelance). Field errors are `MATCHING_INVALID_PROFILE` with a message that starts with the field name ("Skills: mark at least one skill as core.").

— `contracts/openapi.yaml, schemas Profile / InvalidProfile, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-09 — domain invariant

> **Given** the owner's CV contains their name, email, phone number, home address and profile links, and the draft profile comes back with an email address among the skills
> **When** the draft profile is shown
> **Then** it holds no name, contact detail or address — anything that looks like one is removed before the owner sees the draft — and the owner is told what was removed; a profile never holds the owner's name or contact details, so none is ever sent with a scoring
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

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

## Checklist

- [ ] `domain/profile.ts`: the fixed lists as `as const` arrays and the `Profile` type
- [ ] `validateProfile(p)` → list of `{ field, message }` (AC-16): no core skill, salary negative / non-numeric / missing currency or period, years > 60, skill > 50 chars, email / phone / web address in any field
- [ ] `findContactDetails(text)` → `{ kind: name|email|phone|address|link, text }[]` (AC-09), shared with the CV draft (T09)
- [ ] `profileChanged(a, b)`: compares only profile fields, order-insensitive for lists (AC-10 note)
- [ ] `toPeriod(amount, from, to)` with the fixed factors (8 h → day, 21 days → month, 12 months → year) and one table test (F-6)
- [ ] `domain/profile.test.ts`: table-driven over every AC-16 case; this table is the one the web form reuses (F-1)

## Edge cases

| Case | Behaviour |
|---|---|
| Skill "user-0001@example.test" | invalid: "Skills: remove the email address; a profile holds no contact details." |
| Salary 6000 with currency but no period | invalid: currency and period are both required |
| Years 61 | invalid: 60 or fewer |
| Same profile with role types in another order | `profileChanged` false: nothing stale |
| Only the cap changes | not a profile field: nothing stale |
| "+48 000 000 000" in a skill | detected as `phone` |

## Definition of Done

**Done when:** `profile.test.ts` passes for every AC-16 case, the AC-09 contact kinds, the AC-10 change/no-change pairs and the F-6 period table.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
