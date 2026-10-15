---
id: T07
title: "Extract CV text locally from PDF, Word (.docx) and plain text, with the AC-08 refusals"
layer: "infra"
deps: []
blocks: ["T09"]
acs: ["AC-08"]
files_hint: ["apps/server/package.json", "apps/server/src/modules/matching/infra/cv-text.ts", "apps/server/src/modules/matching/infra/cv-text.test.ts", "apps/server/test/fixtures/cv/"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T07 — Extract CV text locally from PDF, Word (.docx) and plain text, with the AC-08 refusals

## Place in the sequence

- **Blocked by:** — · **Blocks:** T09 — Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV · **Wave:** 1.
- **Lane:** shares `apps/server/package.json` with T06 — serialized.

## Why (user story)

> **As an** owner
> **I want** to upload my CV once and get a draft profile I can check and correct
> **So that** I don't have to type my experience field by field
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Turns an uploaded file into plain text on the owner's machine, or refuses it with a reason, before anything could leave.

## Inlined context

> **Chosen:** Option 1. Only local extraction can tell an image-only scan from a text PDF before anything leaves the machine, and only local text can be cleaned of emails, phone numbers and links before it is sent. Text is also fewer tokens than a PDF with page images. The CV file and its text are discarded after the draft is made.
>
> — `adr/0007, Decision outcome, verbatim` · full text: [0007-extract-cv-text-locally-and-send-only-text.md](../adr/0007-extract-cv-text-locally-and-send-only-text.md)

> | CV upload transport | The file travels base64-encoded inside a JSON body; that one route raises its body limit to 7 MB (5 MB file plus encoding); the web checks kind and size before sending, and a body-too-large error on that route is answered with the AC-08 message ("what is wrong and which kinds of file work"), not the generic one; no multipart, so the JSON rule above stays the CSRF guard | here |
>
> — `sad.md §8, CV upload transport, verbatim` · full text: [sad.md](../sad.md)

> | Two new dependencies for reading PDF and Word files | Low | Pick small, maintained libraries in `tasks`; they only read local files; pin versions | Volodymyr Kozlov |
>
> — `sad.md §11, risk, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. The CV and its text are never stored.

## API contract

Errors this layer produces for `draftProfileFromCv`: `MATCHING_CV_UNSUPPORTED`, `MATCHING_CV_NO_TEXT`, `MATCHING_CV_EMPTY`, `MATCHING_CV_TOO_LARGE`, each with "which kinds of file work" in the message ("Upload a PDF, a Word document (.docx) or a plain text file").

— `contracts/openapi.yaml, responses CvUnreadable / CvTooLarge, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-08 — error

> **Given** the owner uploads a file that is not a readable CV — an image-only scan with no text, a file of an unsupported kind, an empty file, or a file larger than 5 MB
> **When** job-radar reads it
> **Then** the owner is told in plain language what is wrong and which kinds of file work; the current profile, if any, stays unchanged; and nothing is sent off the machine or counted against the scoring cap. When the file is readable but the draft cannot be made — the provider is unreachable, the key is missing or refused, or the cap would be exceeded — the owner is told why, the current profile stays unchanged, and the CV is not kept, so the owner uploads it again later
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Pick two small, maintained, pinned libraries for PDF text and .docx text (no native build, no network)
- [ ] `infra/cv-text.ts`: `extractCvText({ mediaType, bytes })` → text, or a typed refusal: unsupported kind, empty, over 5 MB, no text (image-only scan)
- [ ] Detect the kind by content signature as well as the declared type
- [ ] Fixtures in `test/fixtures/cv/`: a text PDF, an image-only PDF, a .docx, a .txt, an empty file, a .png; all with placeholder data only (`Test User`, `user-0001@example.test`)
- [ ] `cv-text.test.ts` over every fixture

## Edge cases

| Case | Behaviour |
|---|---|
| Image-only scan PDF | `MATCHING_CV_NO_TEXT` |
| Empty file | `MATCHING_CV_EMPTY` |
| .png or .doc | `MATCHING_CV_UNSUPPORTED` |
| 5 MB + 1 byte | `MATCHING_CV_TOO_LARGE` |
| PDF declared as text/plain | read as PDF by signature |

## Definition of Done

**Done when:** `cv-text.test.ts` passes for every fixture: text from PDF, .docx and .txt; the four AC-08 refusals for scan, empty, unsupported and oversized files.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
