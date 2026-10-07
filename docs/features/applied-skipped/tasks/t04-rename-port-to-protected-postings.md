---
id: T04
title: "Rename the collector's marks port to ProtectedPostings.protectedAmong and record ADR-0006 as partly superseded"
layer: "app"
deps: []
blocks: ["T08"]
acs: ["AC-09"]
files_hint: ["apps/server/src/modules/collector/app/marked-postings.ts", "apps/server/src/modules/collector/app/cleanup.ts", "apps/server/src/modules/collector/app/run-pipeline.ts", "apps/server/src/modules/collector/index.ts", "apps/server/test/collector-cleanup.integration.test.ts", "apps/server/test/collector-e2e.integration.test.ts", "apps/server/test/collector-pipeline-failures.integration.test.ts", "apps/server/test/helpers/protected-postings.ts", "docs/features/remote-boards-collector/adr/0006-keep-owner-marks-behind-a-port-the-collector-consults-before-removal.md"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T04 — Rename the collector's marks port to ProtectedPostings.protectedAmong and record ADR-0006 as partly superseded

## Place in the sequence

- **Blocked by:** — · **Blocks:** T08 — Implement ProtectedPostings in tracking and wire it into the collector in app.ts · **Wave:** 1 (no deps, starts at once).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** my marks to hold when boards merge, close, reopen or re-list a posting, and when job-radar restarts
> **So that** a decided posting doesn't come back on its own
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Narrows the collector's question from "which are marked" to "which are protected", so skipped postings age out.

## Inlined context

> The port is renamed `MarkedPostings.markedAmong` → `ProtectedPostings.protectedAmong`. Clean-up's code changes only by that name, and its fail-safe stays: if the port fails, nothing is removed that day.
>
> — `sad.md §4, Inline decisions, verbatim` · full text: [sad.md](../sad.md)

> Collector ADR-0006 still describes a delete-restricted reference and a "marked" port — Mitigation: Add "Partly superseded by applied-skipped ADR-0003" to collector ADR-0006, and rename the port's test fixtures, in the first `tracking` task (before `/sdd:implement`)
>
> — `sad.md §11, risk 2, abridged` · full text: [sad.md](../sad.md)

> **Code fact:** the port lives in `collector/app/marked-postings.ts` (`MarkedPostings`, `noMarks`) and is used by `cleanup.ts:34`, `run-pipeline.ts:21`, `collector/index.ts:23,39`, and three test files. All implementers are inside the collector and its tests, so the rename lands green in one task (no compile-coupled split).
>
> — `grep markedAmong|MarkedPostings|noMarks apps/server, 2026-10-07`

> `fakeProtectedPostings(protectedIds)` — replaces the collector's `fakeMarkedPostings` after the port rename (`ProtectedPostings.protectedAmong`).
>
> — `data-model.md §Test fixtures, verbatim` · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-09 — cross-context

> **Given** one skipped and one applied posting are each past the collector's 60-day clean-up limit (more than 60 days since closing, or since any enabled source last offered it, with days when all its sources were disabled not counted)
> **When** the collector's daily clean-up runs
> **Then** the skipped posting is removed exactly as an unmarked one would be, and the applied posting is kept for good, whatever its age
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Rename the interface + method in `collector/app/marked-postings.ts` (keep the file name per sad §5; keep `noMarks` as the empty stub) and update its header comment
- [ ] Update `cleanup.ts`, `run-pipeline.ts`, `collector/index.ts` (option name `protectedPostings`, defaulting to `noMarks`)
- [ ] Add `apps/server/test/helpers/protected-postings.ts` (`fakeProtectedPostings`) and switch the three collector tests to it
- [ ] Add "Partly superseded by applied-skipped ADR-0003 (cascade delete; port narrowed to protected)" to collector ADR-0006's status block

## Edge cases

| Case | Behaviour |
|---|---|
| Port throws | Clean-up removes nothing that day; tomorrow tries again (unchanged) |
| No tracking wired (tests) | `noMarks` protects nothing, as today |

## Definition of Done

**Done when:** Every collector reference uses ProtectedPostings.protectedAmong (noMarks stub kept, renamed fixture fakeProtectedPostings); collector-cleanup integration tests pass unchanged in behaviour, including the port-fails-removes-nothing case.

- [ ] `pnpm --filter @job-radar/server test` passes with no `markedAmong` left (`grep` is empty)
- [ ] collector ADR-0006 carries the partly-superseded line
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
