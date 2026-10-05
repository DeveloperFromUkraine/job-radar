---
id: T11
title: "Add the typed search API client, the TanStack queries and the SkillsField component"
layer: "ui"
deps: []
blocks: ["T13"]
acs: ["AC-05", "AC-13"]
files_hint: ["apps/web/src/api/search.ts", "apps/web/src/features/search/queries.ts", "apps/web/src/features/search/SkillsField.tsx", "apps/web/src/features/search/SkillsField.test.tsx", "apps/web/src/test/contract.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 38
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Add the typed search API client, the TanStack queries and the SkillsField component

## Place in the sequence

- **Blocked by:** — (built against the contract, not the running server) · **Blocks:** T13 — Compose SCR-01 · **Wave:** 1.
- **Lane:** own lane; parallel with T12. Only task that edits `apps/web/src/test/contract.ts`.

## Why (user story)

> **As an** owner
> **I want** job-radar to remember the skills I searched last
> **So that** opening the app shows my list straight away without retyping
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The web's data layer for search plus the field the owner types skills into.

## Inlined context

> **UI architecture (web-frontend):** […] The list uses TanStack Query's infinite query (pages appended client-side, never refetched while shown — so a posting closed while on screen stays, AC-16); the waiting-postings count is polled every 60 s and on window focus, the cadence the problem marker already uses.
>
> — `sad.md §4, UI architecture, abridged` · full text: [sad.md](../sad.md)

> **NEW: SkillsField** — idle: A label "Your skills", a text input with the placeholder "React, TypeScript, Go" and the hint "Separate skills with commas.", and a Button "Search". Enter submits · pending: The Button is pending and the input stays editable · error: 400 `SEARCH_INVALID_SKILLS` — The message is under the input in `text-danger`, linked by `aria-describedby`, and the input has `aria-invalid`. The field is prefilled from `openVisit.last_skills` joined with ", " (AC-13). On phones the input and button stack, full width.
>
> SkillsField — The inventory has no text input or form primitive. It composes Button and adds a label, hint and field-level error
>
> — `screens.md §SCR-01, NEW: SkillsField + New components, abridged` · full text: [screens.md](../screens.md)

> validation: […] After that it re-checks on each submit only (design-system validation rule: no live re-check, because the rules need server parsing)
>
> — `screens.md §SCR-01, state validation, abridged`

Reuse: `components/Button.tsx`; follow `api/collector.ts` (`ApiError`, fetch wrapper) and `features/source-health/queries.ts` (polling pattern). Web contract mocks (`test/contract.ts`) are hard-wired to the collector contract — parametrize by contract so `contractExample("runSearch", 200, "found")` works. Phone layout: usable at 360 px, targets ≥ 44×44 px (spec §6).

**Fallback:** [screens.md](../screens.md) · [openapi.yaml](../contracts/openapi.yaml) · `docs/design-system.md`. Do not guess.

## Data delta

No DB changes.

## API contract

Client functions, one per operation: `openVisit()`, `runSearch(skills: string)`, `getNextPage(snapshotId, cursor)`, `getWaitingCount(snapshotId)` — all `POST` with a JSON body (`{}` when empty); errors surface as `ApiError(code, message, status)` from the envelope `{ error: { code, message } }`. Types mirror `Visit`, `SearchResult`, `PostingPage`, `Posting`, `Listing`, `MatchedSkill`, `WaitingCount`.

— `contracts/openapi.yaml, paths + components.schemas, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-05 — error

> **Given** the owner enters a skill with no letter or digit (for example "#" or "--"), a skill longer than 50 characters, or more than 20 skills
> **When** the owner searches
> **Then** the search does not run, the message under the skills field names the skill (or the count) and the rule it breaks, and the list on screen stays as it was
>
> — `spec.md §5, AC-05, verbatim`

### AC-13 — happy

> **Given** the owner last searched for "React, Go" and closed the app
> **When** the owner opens the main screen again
> **Then** the skills field holds "React, Go" and the list is a fresh search for them; after the owner clears the skills and searches, the next opening starts with an empty field
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `api/search.ts`: typed client + types.
- [ ] `features/search/queries.ts`: `useVisit`, `useSearchList(skills)` (infinite query, `refetchOnWindowFocus: false`, no refetch of shown pages), `useWaitingCount(snapshotId)` (60 s + focus, only while visible, errors silent).
- [ ] `features/search/SkillsField.tsx`: idle / pending / error per manifest; controlled value; prefill from `last_skills.join(", ")`.
- [ ] Parametrize `test/contract.ts`; `SkillsField.test.tsx` with Testing Library.

## Edge cases

| Case | Behaviour |
|---|---|
| `last_skills: []` | empty field |
| 400 `SEARCH_INVALID_SKILLS` | message under input, `aria-invalid`, list untouched (caller keeps last data) |
| Typing after an error | no live re-check; error stays until next submit |
| 360 px | input + button stacked, full width, ≥ 44 px tall |

## Definition of Done

- [ ] component tests: prefill, Enter submits, pending, error with `aria-describedby`
- [ ] client tests use contract examples (no hand-written mocks)
- [ ] lint + vet clean
