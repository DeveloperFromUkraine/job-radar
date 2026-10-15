---
id: T15
title: "Expose matching's routes and wire the module into app.ts"
layer: "ports"
deps: ["T08", "T09", "T12", "T14"]
blocks: ["T21"]
acs: ["AC-07", "AC-08", "AC-16", "AC-17", "AC-19", "AC-20"]
files_hint: ["apps/server/src/modules/matching/ports/routes.ts", "apps/server/src/modules/matching/index.ts", "apps/server/src/app.ts", "apps/server/test/matching-routes.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T15 — Expose matching's routes and wire the module into app.ts

## Place in the sequence

- **Blocked by:** T08 — Implement the settings use cases: read settings, save profile, agree to the notice, set the cap, T09 — Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV, T12 — Implement matching's score reader and scoring health, T14 — Run the background scorer: polling, wake-ups, queue order, retry cadence, start and stop · **Blocks:** T21 — Prove the invariants and NFRs end to end, and add the real-model evaluation run · **Wave:** 5.
- **Lane:** shares `apps/server/src/app.ts` with T10 — serialized.

## Why (user story)

> **As an** owner
> **I want** to upload my CV once and get a draft profile I can check and correct
> **So that** I don't have to type my experience field by field
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to edit my profile at any time and have scores follow the change
> **So that** the scores reflect what I am looking for now
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

Puts every matching operation behind the existing access rules and starts the scorer with the server.

## Inlined context

> | Access | Loopback only, same-origin, JSON body on every state-changing request; applies unchanged to profile, CV draft, cap and notice actions (AC-17) | `core/access.ts`, collector ADR-0007 |
>
> — `sad.md §8, Access, verbatim` · full text: [sad.md](../sad.md)

> | CV upload transport | The file travels base64-encoded inside a JSON body; that one route raises its body limit to 7 MB (5 MB file plus encoding); the web checks kind and size before sending, and a body-too-large error on that route is answered with the AC-08 message ("what is wrong and which kinds of file work"), not the generic one; no multipart, so the JSON rule above stays the CSRF guard | here |
>
> — `sad.md §8, CV upload transport, verbatim` · full text: [sad.md](../sad.md)

> └── index.ts      createMatching(deps) → { plugin, scoreReader, start/stop } registered in app.ts
>
> — `sad.md §5, internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> | Every operation a JSON POST | `getMatchingSettings` and `getScoringHealth` are GETs | Read-only, like the collector's and remote-filter's GETs. No CORS, so another site cannot read the profile (AC-17) |
>
> — `contracts/api-sync-report.md §Deviations, GETs, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

`GET /api/v1/matching/settings` (getMatchingSettings) · `POST /api/v1/matching/profile` (saveProfile) · `POST /api/v1/matching/notice` (agreeNotice) · `POST /api/v1/matching/cap` (setScoringCap) · `POST /api/v1/matching/cv-drafts` (draftProfileFromCv, body limit 7 MB, body-too-large → `413 MATCHING_CV_TOO_LARGE`) · `GET /api/v1/matching/health` (getScoringHealth). Every route: 403 `FORBIDDEN_HOST` / `CROSS_SITE_REQUEST`, 415 without JSON.

— `contracts/openapi.yaml, paths /api/v1/matching/*, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

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

### AC-16 — error

> **Given** the owner is editing their profile
> **When** they try to save it with no core skill, a negative or non-numeric minimum salary, a salary without a currency or period, years of experience above 60, a skill longer than 50 characters, or an email address, phone number or web address in any field
> **Then** the profile is not saved, the owner sees which field is wrong and what it must be, and the existing profile and scores stay unchanged
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — authorization

> **Given** a visitor can reach the owner's machine over the network, or the owner opens a web page from another site in the same browser
> **When** the visitor or that page tries to upload a CV, read or change the profile, or change the scoring cap
> **Then** it cannot — as with search (search AC-17) the whole app is reachable only on the owner's own machine, and as with marks (applied-skipped AC-16) another site cannot act on the owner's behalf, so nobody else can read the owner's profile, replace it, or spend the owner's scoring cap
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

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

## Checklist

- [ ] `ports/routes.ts`: the six routes with JSON schemas from the contract; snake_case ⇄ camelCase at the edge
- [ ] CV route: `bodyLimit` 7 MB; map Fastify's body-too-large on that route to `MATCHING_CV_TOO_LARGE`
- [ ] `index.ts`: `createMatching(deps)` → `{ plugin, scoreReader, start, stop }`; `app.ts` replaces T10's stub reader and starts/stops the scorer on ready/close
- [ ] `matching-routes.integration.test.ts`: every response checked with `loadContract("match-score")`; cross-site and Host refusals

## Edge cases

| Case | Behaviour |
|---|---|
| Another site posts a profile | 403 `CROSS_SITE_REQUEST` (AC-17) |
| Host `evil.example.test` | 403 `FORBIDDEN_HOST` |
| 7 MB + 1 body on the CV route | 413 `MATCHING_CV_TOO_LARGE`, not the generic error |
| `cap_usd_cents: 10001` | 400 `VALIDATION_ERROR` |
| Server close during a scoring | the scorer stops after the in-flight attempt |

## Definition of Done

**Done when:** `matching-routes.integration.test.ts` passes: every operation's documented responses validate against the match-score contract, the AC-17 refusals and the 413 mapping; the server starts and stops cleanly with the scorer running.

- [ ] the test(s) named above pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
