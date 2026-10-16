---
id: T09
title: "Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV"
layer: "app"
deps: ["T02", "T04", "T05", "T06", "T07"]
blocks: ["T15"]
acs: ["AC-07", "AC-08", "AC-09", "AC-20"]
files_hint: ["apps/server/src/modules/matching/app/cv-draft.ts", "apps/server/test/matching-cv-draft.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T09 — Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV

## Place in the sequence

- **Blocked by:** T02 — Write the profile rules: fixed lists, field checks, contact detection, change detection and salary periods, T04 — Write the spend rules: largest possible cost, settled cost from usage, month boundary and cents rounding, T05 — Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction, T06 — Add the Claude client: SDK, configuration, fixed output schemas, usage, error classes and a stand-in provider, T07 — Extract CV text locally from PDF, Word (.docx) and plain text, with the AC-08 refusals · **Blocks:** T15 — Expose matching's routes and wire the module into app.ts · **Wave:** 3.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to upload my CV once and get a draft profile I can check and correct
> **So that** I don't have to type my experience field by field
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Turns an uploaded CV into a draft profile the owner checks, without keeping the CV or sending contact details.

## Inlined context

> **Critical flow 3: drafting the profile from a CV** (AC-07 – AC-09, AC-20; ADR-0006, ADR-0007)
>
> ```mermaid
> sequenceDiagram
>     actor Owner
>     participant Web as Web SPA
>     participant Matching
>     participant DB as Local database
>     participant Claude as Claude API
>
>     Owner->>Web: chooses a CV file on the profile screen
>     alt first time anything would leave the machine
>         Web-->>Owner: data notice - what is sent and to whom
>         Owner->>Web: agrees
>         Web->>Matching: record agreement
>         Matching->>DB: notice agreed at
>     end
>     Web->>Matching: CV file as encoded text in a JSON body
>     Note over Web: checks kind and 5 MB size before sending - over size shows the AC-08 message at once
>     Matching->>Matching: check kind and size again, extract text locally
>     alt no text, unsupported, empty or over 5 MB
>         Matching-->>Web: what is wrong and which files work - nothing sent
>     else text extracted
>         Matching->>Matching: remove emails, phone numbers, addresses and links, list what was removed
>         Matching->>DB: reserve largest possible cost
>         Matching->>Claude: cleaned CV text, fixed profile schema
>         Claude-->>Matching: draft profile, usage
>         Matching->>Matching: validate, map to fixed lists, mark not mapped, drop the CV text
>         Matching->>DB: settle cost
>         Matching-->>Web: draft beside the current profile, removed details
>         Owner->>Web: confirms
>         Web->>Matching: save profile
>         Matching->>DB: replace profile, bump profile version - all scores become stale
>     end
> ```
>
> — `sad.md §6, Flow 3, verbatim` · full text: [sad.md](../sad.md)

> This flow adds the paths flow 3 leaves out. If the owner declines the one-time data notice, the CV is not read and nothing is sent. Once the notice is agreed, matching extracts the text locally, removes contact details and tries to reserve the draft's largest possible cost. If that would exceed the cap, the owner is told the draft cannot be made until next month. If the provider is unreachable, rate-limited, or the key is missing or refused, the reservation stays as spent and the owner is told why. If the answer fails validation, its real cost is settled and the owner is told to try again later. If a usable draft comes back and the owner declines it, the current profile stays as it was. In every branch the CV text is dropped, so the owner uploads it again later.
>
> — `sad.md §6, Flow 5 prose, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1. Only local extraction can tell an image-only scan from a text PDF before anything leaves the machine, and only local text can be cleaned of emails, phone numbers and links before it is sent. Text is also fewer tokens than a PDF with page images. The CV file and its text are discarded after the draft is made.
>
> — `adr/0007, Decision outcome, verbatim` · full text: [0007-extract-cv-text-locally-and-send-only-text.md](../adr/0007-extract-cv-text-locally-and-send-only-text.md)

> | Draft profile time | the draft profile is shown ≤ 60 s p95 after a CV upload of up to 5 MB | integration test with a stand-in provider |
>
> — `spec.md §6, NFR Draft profile time, verbatim` · full text: [spec.md](../spec.md)

> | No personal details sent | 0 scorings carry a name, email, phone number, address or profile link | unit test over what a scoring sends, with a CV full of contact details |
>
> — `spec.md §6, NFR No personal details sent, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Writes only `matching_spend` (one `kind: draft` row: reserve, then settle or no answer) through T05. The CV and the draft are never stored.

— `data-model.md §Entities, matching_spend, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`draftProfileFromCv { file_name, media_type, content_base64 }` → `CvDraft { draft, field_sources, not_mapped[], removed[], current }` · errors `400 MATCHING_CV_UNSUPPORTED|_NO_TEXT|_EMPTY`, `413 MATCHING_CV_TOO_LARGE`, `409 MATCHING_CAP_REACHED|MATCHING_NOTICE_NOT_AGREED`, `502 MATCHING_DRAFT_UNUSABLE`, `503 MATCHING_PROVIDER_UNAVAILABLE|MATCHING_KEY_PROBLEM`.

— `contracts/openapi.yaml, operationId draftProfileFromCv, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-07 — happy

> **Given** the owner uploads their CV as a PDF, a Word document or plain text, with or without a profile already set up
> **When** the draft profile is ready
> **Then** the owner sees the draft profile — core and nice-to-have skills, years of experience, seniority, wanted role types, minimum salary and engagement forms, each marked "from your CV" or "not found in your CV" — shown beside the current profile if there is one, and nothing is scored until the owner confirms it; confirming replaces the whole profile and declining leaves it unchanged; seniority, role types and engagement forms are mapped onto the fixed lists (CONTEXT: Profile) and anything that does not fit is shown as "not mapped"; the CV itself is not kept after the draft is made
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — error

> **Given** the owner uploads a file that is not a readable CV — an image-only scan with no text, a file of an unsupported kind, an empty file, or a file larger than 5 MB
> **When** job-radar reads it
> **Then** the owner is told in plain language what is wrong and which kinds of file work; the current profile, if any, stays unchanged; and nothing is sent off the machine or counted against the scoring cap. When the file is readable but the draft cannot be made — the provider is unreachable, the key is missing or refused, or the cap would be exceeded — the owner is told why, the current profile stays unchanged, and the CV is not kept, so the owner uploads it again later
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** the owner's CV contains their name, email, phone number, home address and profile links, and the draft profile comes back with an email address among the skills
> **When** the draft profile is shown
> **Then** it holds no name, contact detail or address — anything that looks like one is removed before the owner sees the draft — and the owner is told what was removed; a profile never holds the owner's name or contact details, so none is ever sent with a scoring
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — domain invariant

> **Given** nothing has ever been sent to the language-model provider
> **When** the owner uploads a CV for the first time, or confirms a profile for the first time
> **Then** before anything leaves the machine, the owner sees what will be sent and to whom — the CV text once to draft the profile; the profile and each posting's text with every scoring; never a name or contact detail — and nothing is sent until the owner agrees, once; declining leaves the profile unsaved or the CV unread and nothing is sent
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `app/cv-draft.ts`: notice guard → extract (T07) → `findContactDetails` and strip them (T02) → reserve the draft's max cost (T04/T05) → `draft()` (T06) → validate and map onto the fixed lists, collecting `not_mapped` and `field_sources` → settle → return with `current`
- [ ] Run every error path through the same `finally` that drops the bytes and the text
- [ ] Map client errors to the contract codes and statuses
- [ ] `matching-cv-draft.integration.test.ts` with the stand-in provider and the T07 fixtures; assert what the stand-in received has no contact detail

## Edge cases

| Case | Behaviour |
|---|---|
| Notice not agreed | 409 `MATCHING_NOTICE_NOT_AGREED`; nothing read or sent |
| Unreadable file | 400/413 before any reservation; nothing counted |
| Cap would be exceeded | 409 `MATCHING_CAP_REACHED`; nothing sent |
| Provider unreachable / key problem | 503; the reservation counts as spent |
| Unusable draft | 502; cost settled from usage |
| Draft lists "Solutions Architect" as a role | `not_mapped: [{ field: role_types, value }]` |
| Draft holds an email among skills | removed and listed in `removed` (AC-09) |

## Definition of Done

**Done when:** `matching-cv-draft.integration.test.ts` passes every edge-case row, and no request the stand-in received carries a name, email, phone, address or link.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
