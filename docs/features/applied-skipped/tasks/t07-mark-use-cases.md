---
id: T07
title: "Implement the mark, change, clear and undo use cases with their error mapping and MarkState"
layer: "app"
deps: ["T05", "T06"]
blocks: ["T10"]
acs: ["AC-01", "AC-02", "AC-06", "AC-07", "AC-14"]
files_hint: ["apps/server/src/modules/tracking/app/marks.ts", "apps/server/test/tracking-marks.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T07 — Implement the mark, change, clear and undo use cases with their error mapping and MarkState

## Place in the sequence

- **Blocked by:** T05 — Add the collector's read-only exports: postings by id including closed, and the retention outlook, T06 — Write the tracking repo: guarded mark writes, undo, and the mark reads every flow needs · **Blocks:** T10 — Expose setMark and undoMark as Fastify routes behind the access guard and register the tracking plugin · **Wave:** 3 (after its deps finish).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to mark a posting applied after I apply to it
> **So that** it leaves my list and I never review it again
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As an** owner
> **I want** to see the postings I marked, including closed ones, and change or clear a mark
> **So that** I can find a role I applied to when a recruiter replies, and fix a decision I regret
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

The service the routes call: one place that turns domain decisions and repo writes into the owner-facing outcomes.

## Inlined context

> `app` runs the mark use cases. — `marks.ts` (mark / change / clear / undo)
>
> — `sad.md §5, Building block view, abridged` · full text: [sad.md](../sad.md)

> Flow 4: changes or clears the mark → writes the new mark, the previous state, a new change id, and when applied was lost if it was. alt posting removed → posting no longer in job-radar; save fails → could not save; mark changed → new mark, date and change id; open posting cleared → cleared, change id; closed posting cleared → Tracking asks the Collector when clean-up will remove it → cleared, removal date (the later of the grace day end and the retention date), change id.
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> Error handling: distinct codes and plain-language messages for: the posting is no longer in job-radar (AC-15); the mark changed elsewhere, so undo is refused (AC-04); marks cannot be saved right now, which the web shows with Retry, keeping its earlier state (AC-14).
>
> — `sad.md §8, Error handling, abridged` · full text: [sad.md](../sad.md)

> The confirm step before losing applied protection (AC-07) is web-only and is shown when the card's `at_risk` is true. The server does not require a confirmation flag.
>
> — `contracts/openapi.yaml, setMark description, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Hard rule:** Errors use one envelope `{ "error": { "code", "message" } }`, shaped only by `core/errors.ts`; expected failures throw `AppError(code, message, status)`. IDs are UUIDv7 from `core/id.ts`, generated in the app.
>
> — `sad.md §2, Conventions, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** One line per mark change carries the action and duration. Posting titles and company names are never logged, since together with the marks they reveal where the owner applied (spec §6.1)
>
> — `sad.md §8, Logging, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`. A module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `posting_id` | text | PK, FK → `collector_postings.id` ON DELETE CASCADE | written via repo (T06) |
| `mark` | text | `applied` \| `skipped`; `NULL` = cleared (row kept) | written via repo (T06) |
| `marked_at` | integer | NOT NULL; when the current state was set | written via repo (T06) |
| `previous_mark` | text | `NULL` with `previous_marked_at` `NULL` = never marked (undo deletes the row) | written via repo (T06) |
| `previous_marked_at` | integer | the previous state's original date, restored by undo | written via repo (T06) |
| `applied_lost_at` | integer | starts the grace day; `NULL` when marked applied again | written via repo (T06) |
| `previous_applied_lost_at` | integer | restored by undo | written via repo (T06) |
| `change_id` | text | NOT NULL, UUIDv7, replaced on every change, undo included | written via repo (T06) |

— `data-model.md §Entities, tracking_marks, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `setMark` → `200 MarkState`; `undoMark` → `200 MarkState` (first-mark undo: `mark`, `marked_at`, `change_id` all null).

`MarkState` = `{ posting_id, mark: applied|skipped|null, marked_at: date-time|null, change_id: uuid|null, at_risk: boolean, removed_after: date|null }` — `at_risk`: past the collector's 60-day rule; `removed_after`: for a cleared closed posting, the later of the grace-day end and the retention date, else null.

— `contracts/openapi.yaml, components.schemas.MarkState, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

- `404 TRACKING_POSTING_NOT_FOUND` "This posting is no longer in job-radar." (AC-15)
- `409 TRACKING_MARK_CHANGED_ELSEWHERE` "This mark was changed elsewhere, so it was not undone. See the marked postings for its current mark." (undo only, AC-04)
- `503 TRACKING_MARKS_UNAVAILABLE` "Job-radar could not save your mark just now. Try again." (AC-14)

— `contracts/openapi.yaml, components.responses PostingNotFound / MarksUnavailable + undoMark 409, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** an open posting is in the owner's list
> **When** the owner marks it applied
> **Then** it leaves the list at once and the number of postings shown drops by one, a notice says "Marked applied" with an Undo action, and the posting does not appear in the owner's list again (on later pages, on the next search or visit, or after job-radar restarts) unless the owner clears or undoes the mark
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — happy

> **Given** an open posting from a company with other open postings is in the owner's list
> **When** the owner marks it skipped
> **Then** it leaves the list exactly as an applied posting does (AC-01), with the notice "Marked skipped" and Undo, and the company's other postings stay in the list
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** a posting is shown in the marked postings
> **When** the owner changes its mark (applied to skipped or back) or clears it
> **Then** a changed mark replaces the old one (a posting has at most one mark) and the date updates. A cleared open posting returns to the main list and its counts in its publication-time position, and it counts as new only by the rule for new postings (first collected after the previous visit started), never because its mark was cleared. A cleared closed posting stays in the marked postings as AC-05 and AC-07 describe.
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a posting marked applied that clean-up would remove if it were not applied (it is past the collector's 60-day rule, AC-09)
> **When** the owner clears its mark or changes it to skipped
> **Then** before the change, the owner is told that without the applied mark the posting will be removed at clean-up. Once changed, it is kept until the end of the next calendar day (its grace day), and the owner can mark it applied again until then. Every closed posting whose mark the owner cleared, whatever its age, stays in the marked postings labelled "Cleared, removed after <the date clean-up will remove it>" until it is removed, and the owner can mark it again there. If a source offers the posting again, it is no longer due for removal and keeps its place by the normal rules.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** job-radar cannot save marks at the moment
> **When** the owner marks a posting, presses Undo, changes a mark or clears it
> **Then** the screen keeps its earlier state, the owner sees a plain-language message with a retry action, and nothing is shown that was not saved
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tracking/app/marks.ts`: `setMark(postingId, mark|null)` and `undoMark(postingId, changeId)` — domain (T02) decides, repo (T06) writes, injected clock + `core/id.ts` change ids
- [ ] Compute `at_risk` and `removed_after` from `retentionOutlook` (T05) + `graceEnd` (T02)
- [ ] Map: FK error → `AppError(TRACKING_POSTING_NOT_FOUND, 404)`; stale guard → `409 TRACKING_MARK_CHANGED_ELSEWHERE`; SQLite write error (busy/IO) → `503 TRACKING_MARKS_UNAVAILABLE`
- [ ] One pino line per change: action + duration, no title or company
- [ ] `apps/server/test/tracking-marks.integration.test.ts` with an injected failing repo for AC-14

## Edge cases

| Case | Behaviour |
|---|---|
| Clear applied on a posting past 60 days | Saved; `at_risk: true`; posting protected through its grace day (AC-07) |
| Clear a closed posting | `removed_after` = later of grace end and retention date |
| Clear an open posting | `removed_after: null`; posting returns to the main list (search's job) |
| Undo after a 200 whose response was lost | 409 (change id already replaced) |
| DB refuses the write | 503, nothing written, no change id issued (AC-14) |

## Definition of Done

**Done when:** tracking-marks.integration.test.ts passes: setMark/undoMark return MarkState with the right at_risk and removed_after, map a removed posting to TRACKING_POSTING_NOT_FOUND, a stale undo to TRACKING_MARK_CHANGED_ELSEWHERE, and an injected write failure to TRACKING_MARKS_UNAVAILABLE with nothing written.

- [ ] `tracking-marks.integration.test.ts` passes for every row of the edge-case table
- [ ] no log line contains a title or company (asserted in the test)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
