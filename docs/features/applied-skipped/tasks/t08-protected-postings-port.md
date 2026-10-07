---
id: T08
title: "Implement ProtectedPostings in tracking and wire it into the collector in app.ts"
layer: "app"
deps: ["T04", "T06"]
blocks: ["T10", "T11", "T17"]
acs: ["AC-07", "AC-09"]
files_hint: ["apps/server/src/modules/tracking/app/protected-postings.ts", "apps/server/src/modules/tracking/index.ts", "apps/server/src/app.ts", "apps/server/test/tracking-protected.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "done"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T08 — Implement ProtectedPostings in tracking and wire it into the collector in app.ts

## Place in the sequence

- **Blocked by:** T04 — Rename the collector's marks port to ProtectedPostings.protectedAmong and record ADR-0006 as partly superseded, T06 — Write the tracking repo: guarded mark writes, undo, and the mark reads every flow needs · **Blocks:** T10 — Expose setMark and undoMark as Fastify routes behind the access guard and register the tracking plugin, T11 — Make search's main list mark-aware: snapshot keeps marked, pages skip them, counts and hints, T17 — Prove marks hold through every collector event and a restart, and that marking stays under 300 ms p95 · **Wave:** 3 (after its deps finish).
- **Lane:** shares files with T10, T11 — serialized with them.

## Why (user story)

> **As an** owner
> **I want** my marks to hold when boards merge, close, reopen or re-list a posting, and when job-radar restarts
> **So that** a decided posting doesn't come back on its own
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Real marks behind the collector's clean-up: applied kept for good, skipped aged out like unmarked.

## Inlined context

> `app.ts` creates tracking first, passes its ProtectedPostings to the collector, registers all three
> `protected-postings.ts` (the collector's port)
>
> — `sad.md §5, Internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> Flow 6: Collector asks Tracking which of these are protected → Tracking reads applied marks, and applied lost within the grace day → protected posting ids. alt port fails → fail-safe instead of a dead-letter: nothing removed today, retried at tomorrow's clean-up; else answered → removes unprotected candidates, skipped and cleared ones included; mark rows of removed postings deleted by cascade.
>
> — `sad.md §6, Flow 6, abridged` · full text: [sad.md](../sad.md)

> Applied postings are protected by the port's answer alone. Delete-restricted becomes cascade (ADR-0003), so a bug in the port could let clean-up remove an applied posting and its mark for good — Mitigation: The AC-09 integration test with real marks guards every build. The port keeps its fail-safe. The port is unit-tested over applied, skipped, cleared and grace cases
>
> — `sad.md §11, risk 1, abridged` · full text: [sad.md](../sad.md)

> The collector sees tracking only through the port wired in `app.ts`, so there is no import cycle.
>
> — `sad.md §4, choice 1, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`. A module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `posting_id` | text | PK, FK → `collector_postings.id` ON DELETE CASCADE | read-only |
| `mark` | text | `applied` \| `skipped`; `NULL` = cleared (row kept) | read-only |
| `marked_at` | integer | NOT NULL; when the current state was set | read-only |
| `previous_mark` | text | `NULL` with `previous_marked_at` `NULL` = never marked (undo deletes the row) | read-only |
| `previous_marked_at` | integer | the previous state's original date, restored by undo | read-only |
| `applied_lost_at` | integer | starts the grace day; `NULL` when marked applied again | read-only |
| `previous_applied_lost_at` | integer | restored by undo | read-only |
| `change_id` | text | NOT NULL, UUIDv7, replaced on every change, undo included | read-only |

— `data-model.md §Entities, tracking_marks, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-07 — domain invariant

> **Given** a posting marked applied that clean-up would remove if it were not applied (it is past the collector's 60-day rule, AC-09)
> **When** the owner clears its mark or changes it to skipped
> **Then** before the change, the owner is told that without the applied mark the posting will be removed at clean-up. Once changed, it is kept until the end of the next calendar day (its grace day), and the owner can mark it applied again until then. Every closed posting whose mark the owner cleared, whatever its age, stays in the marked postings labelled "Cleared, removed after <the date clean-up will remove it>" until it is removed, and the owner can mark it again there. If a source offers the posting again, it is no longer due for removal and keeps its place by the normal rules.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — cross-context

> **Given** one skipped and one applied posting are each past the collector's 60-day clean-up limit (more than 60 days since closing, or since any enabled source last offered it, with days when all its sources were disabled not counted)
> **When** the collector's daily clean-up runs
> **Then** the skipped posting is removed exactly as an unmarked one would be, and the applied posting is kept for good, whatever its age
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tracking/app/protected-postings.ts`: `protectedAmong(ids)` = applied rows + rows whose `applied_lost_at` is within `graceEnd` (T02), via the repo (T06)
- [ ] `tracking/index.ts`: export a `createTracking({ db, now, timeZone })` returning the port (routes plugin comes in T10)
- [ ] `app.ts`: create tracking before the collector and pass its port as the collector's `protectedPostings`
- [ ] `apps/server/test/tracking-protected.integration.test.ts` driving `dailyCleanup` with a fake clock

## Edge cases

| Case | Behaviour |
|---|---|
| Skipped posting past 60 days | Removed; its mark row cascades (AC-09) |
| Applied posting of any age | Kept |
| Applied lost yesterday, clean-up today | Kept (grace day) |
| Applied lost two days ago | Removed if past retention |
| Port throws | Nothing removed today |

## Definition of Done

**Done when:** tracking-protected.integration.test.ts runs dailyCleanup with the real port: a skipped and an applied posting past 60 days → skipped removed (mark row cascaded), applied kept; an applied-lost posting kept through its grace day and removed the day after.

- [ ] `tracking-protected.integration.test.ts` passes
- [ ] `app.smoke.test.ts` still boots the app
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
