---
id: T20
title: "Add CV upload and the draft review to the profile screen"
layer: "ui"
deps: ["T19"]
blocks: []
acs: ["AC-07", "AC-08", "AC-09"]
files_hint: ["apps/web/src/features/matching/CvUpload.tsx", "apps/web/src/features/matching/DraftReview.tsx", "apps/web/src/routes/Profile.tsx"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T20 — Add CV upload and the draft review to the profile screen

## Place in the sequence

- **Blocked by:** T19 — Build the profile screen: route, AppNav link, ProfileForm, DataNotice and CapField · **Blocks:** — · **Wave:** 3.
- **Lane:** shares `apps/web/src/routes/Profile.tsx` with T19 — serialized.

## Why (user story)

> **As an** owner
> **I want** to upload my CV once and get a draft profile I can check and correct
> **So that** I don't have to type my experience field by field
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Lets the owner draft the profile from a CV and check every field before using it.

## Inlined context

> | idle | "Upload your CV": a native file input (`accept=".pdf,.docx,.txt"`) in a 44 px labelled button, with the line "PDF, Word (.docx) or text, up to 5 MB" | NEW: CvUpload | wireframe 03-a |
> | client refusal | Over 5 MB or an unsupported kind, checked before sending (sad.md §8). The message sits under the button: "This file is larger than 5 MB…" / "This kind of file can't be read…". Nothing is sent | CvUpload (error) | — |
> | drafting | `draftProfileFromCv` in flight (up to 60 s, spec §6). The button is pending with "Reading your CV…" and the rest of the screen stays usable | Button (pending) | — |
> | unreadable | 400 `MATCHING_CV_UNSUPPORTED` / `_NO_TEXT` / `_EMPTY`, or 413 `MATCHING_CV_TOO_LARGE` (AC-08). The API message under the button; the profile is unchanged | CvUpload (error) | — |
> | draft refused | 409 `MATCHING_CAP_REACHED` (AC-08). The message and the action "Change cap" | InlineBanner (warning), Button | — |
> | provider problem | 503 `MATCHING_PROVIDER_UNAVAILABLE` / `MATCHING_KEY_PROBLEM`, or 502 `MATCHING_DRAFT_UNUSABLE` (AC-08). The message, "Upload again later", and the form below still usable by hand | InlineBanner (error) | — |
> | draft ready | 200 (AC-07, AC-09). DraftReview replaces the form. Each field shows the draft's value with a tag: "from your CV" / "not found in your CV"; for `not_mapped`, "not mapped: Solutions Architect". "Your current profile" is shown beside it from `md:` and below it on phones (collapsed, "Show current profile"). A notice reads "Removed before anything was sent: your name, email, phone, 1 link" (`removed`). Then "Use this profile" and "Discard". Fields can be corrected before using it | NEW: DraftReview, Badge (notice), InlineBanner (info), Button ×2 | wireframe 03-d |
> | draft confirmed | "Use this profile" runs `saveProfile` (the core-skill rule applies, so validation states can show). On 200, back to SCR-01 | ProfileForm states | — |
> | draft discarded | "Discard". The current profile is unchanged, and the draft is gone (it was never stored) | — | — |
>
> — `screens.md §SCR-03, CvUpload and DraftReview, verbatim` · full text: [screens.md](../screens.md)

> | DraftReview | It shows a proposed profile with per-field provenance tags beside the current one. ProfileForm is for editing; this view is for comparing. It reuses ProfileForm's fields for corrections | pending |
>
> — `screens.md §New components, DraftReview, verbatim` · full text: [screens.md](../screens.md)

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

`draftProfileFromCv { file_name, media_type, content_base64 }` → `CvDraft`; errors 400/409/413/502/503 as in the contract; confirm with `saveProfile`.

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

## Checklist

- [ ] `CvUpload.tsx`: native file input behind a 44 px button; client checks (kind, ≤ 5 MB) before sending; base64 encode
- [ ] `DraftReview.tsx`: draft with `from_cv` / `not_found` tags, `not_mapped` values, the `removed` notice, current profile beside (collapsed on phones), Use / Discard
- [ ] "Use this profile" goes through ProfileForm's save (T19)
- [ ] Tests per state with the contract example

## Edge cases

| Case | Behaviour |
|---|---|
| 6 MB file | refused in the browser; nothing sent |
| 409 cap reached | message + Change cap |
| Discard | current profile unchanged; draft gone |

## Definition of Done

**Done when:** Testing Library tests pass for every CvUpload/DraftReview state in SCR-03, including the client-side 5 MB refusal and the removed-details notice.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
