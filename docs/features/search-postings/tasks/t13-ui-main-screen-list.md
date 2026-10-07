---
id: T13
title: "Compose SCR-01: visit, skills search, summary line and the list's loading/empty/error states"
layer: "ui"
deps: ["T11", "T12"]
blocks: ["T14"]
acs: ["AC-01", "AC-10", "AC-11", "AC-12", "AC-14"]
files_hint: ["apps/web/src/routes/Home.tsx", "apps/web/src/routes/Home.test.tsx", "apps/web/src/features/search/SearchList.tsx"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 57
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T13 — Compose SCR-01: visit, skills search, summary line and the list's loading/empty/error states

## Place in the sequence

- **Blocked by:** T11 — API client + SkillsField, T12 — PostingCard · **Blocks:** T14 — Show more, waiting notice, expired list · **Wave:** 2.
- **Lane:** shares `routes/Home.tsx` with T14 — serialized (T13 first).

## Why (user story)

> **As an** owner
> **I want** the list with no skills entered to show every open posting, newest first
> **So that** the main screen works as my feed of what job-radar has collected
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Turns the placeholder home into the owner's list: open → visit → search → first 50.

## Inlined context

| State | Trigger / condition | Components |
|---|---|---|
| loading | The screen opens. `openVisit`, then the first `runSearch`, are in flight (flow 1) | App shell, SkillsField (input and Button disabled), SkeletonRow ×3 |
| default | `runSearch` 200 with `total > 0` and skills entered. The summary reads "130 postings · 3 new"; cards are newest first with matched-skill chips | SkillsField, PostingCard ×≤50 |
| feed | Empty skills field (AC-10, US-04). The summary reads "412 open postings · 3 new", with no skill chips on any card | as default |
| first visit | `previous_visit_started_at: null` (AC-14). No "· N new" in the summary and no New badges | as default |
| searching | The owner resubmits while a list is shown (flow 3). The list on screen stays until the answer arrives | SkillsField (Button pending) |
| validation | 400 `SEARCH_INVALID_SKILLS` (AC-05). The API message sits under the field in `text-danger`, and the list on screen is unchanged | SkillsField (error) |
| empty: nothing matches | 200 `total: 0`, `collection_empty: false` (AC-11). "Nothing matches React, Go." plus one action, "Clear skills", which empties the field and runs the feed | Button "Clear skills" |
| empty: collection empty | 200 `collection_empty: true` (AC-11). "The first collection hasn't brought postings yet." with an "Open source health" link to SCR-02, plus "Clear skills" when skills were used | InlineBanner (info), Button "Clear skills" (only with skills) |
| error | `runSearch` 503 `SEARCH_COLLECTION_UNAVAILABLE` / 500 / 403 / 415, or `openVisit` fails (AC-12, flow 3). The API message shows with Retry. The skills stay in the field and the last list stays visible below. Retry repeats the failed call | InlineBanner (error, Retry) |
| problem | Collector `has_problem: true`. Unchanged | ProblemMarker |

— `screens.md §SCR-01, states loading…error + problem, abridged` · full text: [screens.md](../screens.md) (wireframes 01-a – 01-d′)

Component tree: App shell › ProblemMarker (when flagged) › SkillsField › summary line › WaitingNotice › PostingCard list › show-more. (WaitingNotice and show-more are T14.) Keep the existing problem-marker block in `Home.tsx` as is. Reuse `InlineBanner`, `SkeletonRow`, `Button`.

**Fallback:** [screens.md](../screens.md) · [ux-flows.md](../ux-flows.md) · [openapi.yaml](../contracts/openapi.yaml). Do not guess.

## Data delta

No DB changes.

## API contract

`openVisit` → `{ last_skills, previous_visit_started_at }`; then `runSearch({ skills })` → `SearchResult { total, new_count, collection_empty, skills, items, … }`. Errors per T11's `ApiError`. — `contracts/openapi.yaml, openVisit + runSearch, abridged`

## Acceptance criteria

### AC-01 — happy

> **Given** the collection holds open postings, some of which mention "React" or "TypeScript" in their title or description
> **When** the owner searches for the skills "React, TypeScript"
> **Then** the owner sees exactly the open postings that mention at least one of the two skills, newest first, with the number of postings found
>
> — `spec.md §5, AC-01, verbatim`

### AC-10 — happy

> **Given** the skills field is empty
> **When** the owner opens the main screen or searches
> **Then** they see every open posting, newest first, with the total number of open postings and no matched skills on any posting
>
> — `spec.md §5, AC-10, verbatim`

### AC-11 — error

> **Given** the collection holds no open posting that mentions any of the owner's skills — or holds no postings at all yet
> **When** the owner searches
> **Then** the owner sees that nothing matches, with the skills they used and one action to clear them; when the collection is still empty, the message says the first collection has not brought postings yet and points to source health
>
> — `spec.md §5, AC-11, verbatim`

### AC-14 — happy

> **Given** the owner's previous visit to the main screen started yesterday at 09:00, and since then the collector added postings — including one published two days ago that a slower source delivered this morning
> **When** the owner opens the main screen
> **Then** every posting first collected after yesterday 09:00 is marked new — the late one included, in its publication-time position — and the screen shows how many of the listed postings are new
>
> — `spec.md §5, AC-14, verbatim`

### AC-12 — error

> **Given** the owner searches while job-radar cannot read its collection
> **When** the search fails
> **Then** the owner sees a plain-language message with a retry action next to the list, their skills stay in the field, and the last list shown stays visible
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `features/search/SearchList.tsx`: summary line ("N postings" / "N open postings", "· M new" unless first visit) + PostingCard list + empty states.
- [ ] `routes/Home.tsx`: ProblemMarker (unchanged) › SkillsField › SearchList; flow: `openVisit` → prefill → `runSearch`.
- [ ] Keep previous data on error/validation (`placeholderData: keepPreviousData` or equivalent).
- [ ] `Home.test.tsx`: each state above, mocks from contract examples.

## Edge cases

| Case | Behaviour |
|---|---|
| `openVisit` fails | error banner with Retry; field empty |
| 503 after a list was shown | banner + old list visible below |
| "Clear skills" | field emptied, feed searched |
| Collection empty, no skills | info banner, no "Clear skills" |

## Definition of Done

- [ ] `Home.test.tsx` covers loading, default ("· N new" + New badges, AC-14), feed, first visit, validation, both empties, error
- [ ] lint + vet clean
