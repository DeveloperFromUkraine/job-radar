---
id: T4
title: "Define the settings schema, built-in defaults and per-source state"
layer: "domain"
deps: []
blocks: ["T10", "T13"]
acs: ["AC-26", "AC-27"]
files_hint: ["apps/server/src/modules/collector/domain/settings.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
# measured inlined lines: 36
status: "done"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T4 — Define the settings schema, built-in defaults and per-source state

## Place in the sequence

- **Blocked by:** nothing — starts in wave 0 · **Blocks:** T10 — Read, create and fall back on the settings file, persisting the last valid copy, T13 — Run the one-minute scheduler, start-up recovery and run opening · **Wave:** 0 (no prerequisites).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to choose, in a settings file on my machine, which sources are enabled and which of their job categories count as tech
> **So that** the collection holds only roles I could want and I can adjust when a board changes its categories
>
> > **Visitor:** no user story — a visitor has no goal this feature serves; the role exists only to be kept out, covered by AC-17 and §6.1.
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Gives the owner's settings file one validated shape and decides each source's state (enabled / disabled / not verified).

## Inlined context

> **Settings file.** `apps/server/data/settings.json` (beside the database, gitignored): enabled flag per source and tech categories per source. Re-read at the start of every run (no file watcher), validated against a schema; a valid copy is stored in the database as the last valid settings, so an unreadable file — even after a restart — keeps collection on the last valid copy (AC-27). A missing file is created with built-in defaults (every source except We Work Remotely enabled).
>
> — `sad.md §5, Settings file, verbatim` · full text: [sad.md](../sad.md)

> - Editing settings inside the app — sources and categories are set only in the owner's local settings file (US-08).
>
> — `spec.md §3, Non-goals, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-26 — happy

> **Given** a source is disabled in the owner's settings file
> **When** any collection run starts — scheduled, catch-up or collect-now
> **Then** that source is not read, its existing postings are neither closed nor removed because of it (the AC-10 clock is paused while all of a posting's sources are disabled), its listings no longer count toward closing (AC-07), and source health shows it as disabled
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

### AC-27 — error

> **Given** the owner's settings file is missing, or cannot be read
> **When** the app starts or a collection run starts
> **Then** a missing file is created with built-in defaults (every source except We Work Remotely enabled, a default tech category list per source) and source health says defaults are in use; an unreadable file leaves collection running on the last valid settings and source health names the problem in plain words; a file that can be read but names an unknown source or otherwise breaks the settings rules counts as unreadable as a whole; an unreadable file with no last valid settings yet (e.g. on the first start) runs on the built-in defaults and is not overwritten; a source the owner enables while its allowed rate is 0 (We Work Remotely until §8 Q1) shows as "enabled, not read until its limits are verified" and is never flagged as silent; a valid edit takes effect from the next run without restarting the app
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `Settings` type: per source `enabled` + `categories: string[]` — `domain/settings.ts`
- [ ] Built-in defaults: every source enabled except We Work Remotely; a default tech category list per source taken from that source's published categories (cite the source + date in a comment) — `domain/settings.ts`
- [ ] `parseSettings(json)` → valid settings, or `unreadable` with a plain-language reason; an unknown source or any broken rule makes the whole file unreadable — `domain/settings.ts`
- [ ] `sourceState(settings, registry)` → `enabled | disabled | not_verified` (enabled + allowed rate 0) — `domain/settings.ts`
- [ ] Unit tests for each branch — `domain/settings.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Invalid JSON | Unreadable, reason names the parse problem |
| Unknown source key `remoteok` | Whole file unreadable, reason names the key |
| We Work Remotely enabled | `not_verified` — never read, never flagged silent |
| Source disabled | `disabled` — not read; postings untouched |

## Definition of Done

- [ ] unit tests for parse, defaults and source state pass
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
