---
id: T10
title: "Expose setMark and undoMark as Fastify routes behind the access guard and register the tracking plugin"
layer: "ports"
deps: ["T07", "T08"]
blocks: ["T17"]
acs: ["AC-03", "AC-04", "AC-14", "AC-15", "AC-16"]
files_hint: ["apps/server/src/modules/tracking/ports/routes.ts", "apps/server/src/modules/tracking/index.ts", "apps/server/src/app.ts", "apps/server/test/tracking-routes.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Expose setMark and undoMark as Fastify routes behind the access guard and register the tracking plugin

## Place in the sequence

- **Blocked by:** T07 — Implement the mark, change, clear and undo use cases with their error mapping and MarkState, T08 — Implement ProtectedPostings in tracking and wire it into the collector in app.ts · **Blocks:** T17 — Prove marks hold through every collector event and a restart, and that marking stays under 300 ms p95 · **Wave:** 4 (after its deps finish).
- **Lane:** shares files with T08, T11 — serialized with them.

## Why (user story)

> **As an** owner
> **I want** to mark a posting applied after I apply to it
> **So that** it leaves my list and I never review it again
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to undo a mark in the moment after I set it
> **So that** a mis-click doesn't hide a posting I wanted
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The two HTTP doors the web app uses to change marks, and nothing else.

## Inlined context

> Access control: Unchanged: loopback bind, Host check, and state-changing requests accepted only same-origin with a JSON body; no CORS. Every tracking route changes state, so all are JSON POSTs behind the global guard (AC-16)
>
> — `sad.md §8, Access control, verbatim` · full text: [sad.md](../sad.md)

> QG-5 How verify: integration test sending the tracking routes a request with a foreign Host and one marked cross-site; both refused, no mark recorded.
>
> — `sad.md §10, QG-5, verbatim` · full text: [sad.md](../sad.md)

> `ports` holds the Fastify routes. — `routes.ts` — mark, change or clear, undo
>
> — `sad.md §5, Building block view, abridged` · full text: [sad.md](../sad.md)

> **Code fact:** server tests validate bodies with `loadContract(slug)` from `apps/server/test/helpers/contract.ts`; use `loadContract("applied-skipped")`.
>
> — `apps/server/test/helpers/contract.ts:10-16, abridged`

> **Hard rule:** Errors use one envelope `{ "error": { "code", "message" } }`, shaped only by `core/errors.ts`; expected failures throw `AppError(code, message, status)`. IDs are UUIDv7 from `core/id.ts`, generated in the app.
>
> — `sad.md §2, Conventions, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `POST /api/v1/tracking/marks/{posting_id}` (`setMark`) body `SetMarkRequest { mark: applied|skipped|null }`, `additionalProperties: false` → `200 MarkState` · `400 VALIDATION_ERROR` · `403 FORBIDDEN_HOST | CROSS_SITE_REQUEST` · `404` · `415 UNSUPPORTED_MEDIA_TYPE` · `500 INTERNAL` · `503`.
- `POST /api/v1/tracking/marks/{posting_id}/undo` (`undoMark`) body `UndoRequest { change_id: uuid }` → `200 MarkState` · same errors + `409`.

- `404 TRACKING_POSTING_NOT_FOUND` "This posting is no longer in job-radar." (AC-15)
- `409 TRACKING_MARK_CHANGED_ELSEWHERE` "This mark was changed elsewhere, so it was not undone. See the marked postings for its current mark." (undo only, AC-04)
- `503 TRACKING_MARKS_UNAVAILABLE` "Job-radar could not save your mark just now. Try again." (AC-14)

— `contracts/openapi.yaml, components.responses PostingNotFound / MarksUnavailable + undoMark 409, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-03 — happy

> **Given** the owner has just marked a posting, changed its mark or cleared it, and the notice with Undo is showing (it shows for 8 seconds and closes sooner when the owner marks or changes another posting, searches, turns the marked postings on or off, or reloads; once it closes, Undo is no longer offered and the mark is changed from the marked postings)
> **When** the owner presses Undo
> **Then** the posting returns exactly to its earlier state (unmarked, or its previous mark with that mark's original date) and to its place in the list, the count is restored, and the posting keeps its "new" flag if it had one
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** the owner set a mark in one window, and since then that posting's mark was changed or cleared from any window, even back to the same mark
> **When** the owner presses Undo in the first window
> **Then** the mark is not reverted, because an undo only reverses a mark that nothing has changed since, and the owner is told the mark changed elsewhere and can see the current mark in the marked postings
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** job-radar cannot save marks at the moment
> **When** the owner marks a posting, presses Undo, changes a mark or clears it
> **Then** the screen keeps its earlier state, the owner sees a plain-language message with a retry action, and nothing is shown that was not saved
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — error

> **Given** a posting on screen was removed by clean-up after the list was loaded
> **When** the owner marks it or changes its mark
> **Then** the owner is told the posting is no longer in job-radar, and its card leaves the list without any mark being recorded
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — authorization

> **Given** a visitor can reach the owner's machine over the network, or the owner opens a web page from another site in the same browser
> **When** the visitor or that page tries to mark, change or clear a mark on any posting
> **Then** it cannot. Only the owner's own job-radar screen on the owner's machine can change marks, so nobody else can hide postings from the owner or alter their record of applications.
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tracking/ports/routes.ts`: two JSON POST routes with Fastify JSON schemas for params and bodies; call T07
- [ ] `tracking/index.ts`: Fastify plugin registering the routes (logger child `module=tracking`)
- [ ] `app.ts`: register the tracking plugin next to collector and search
- [ ] `apps/server/test/tracking-routes.integration.test.ts`: contract validation + AC-16 cases

## Edge cases

| Case | Behaviour |
|---|---|
| `posting_id` not a UUID | 400 `VALIDATION_ERROR` |
| `mark: "maybe"` | 400 `VALIDATION_ERROR` |
| Form-encoded body | 415 |
| `Host: evil.test` | 403 `FORBIDDEN_HOST`, nothing written |
| `Sec-Fetch-Site: cross-site` | 403 `CROSS_SITE_REQUEST`, nothing written |

## Definition of Done

**Done when:** tracking-routes.integration.test.ts validates every response against the applied-skipped contract (loadContract) for 200/400/404/409/415/503, and requests with a foreign Host or Sec-Fetch-Site: cross-site are refused 403 with no mark recorded.

- [ ] every route response validates against `docs/features/applied-skipped/contracts/openapi.yaml`
- [ ] handler returns the spec'd outcome for AC-04, AC-14, AC-15, AC-16
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
