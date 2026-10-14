---
id: T06
title: "Write the settings repo with the lazily created singleton row and its test fixture"
layer: "infra"
deps: ["T01"]
blocks: ["T07"]
acs: ["AC-04", "AC-06", "AC-07"]
files_hint: ["apps/server/src/modules/remote-filter/infra/repo.ts", "apps/server/test/helpers/remote-filter-fixtures.ts", "apps/server/test/remote-filter-repo.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T06 — Write the settings repo with the lazily created singleton row and its test fixture

## Place in the sequence

- **Blocked by:** T01 — Create the remote_filter_settings table · **Blocks:** T07 — Implement the settings use cases, country lookup and active filter · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to choose my country once and have job-radar remember it
> **So that** the filter works every time I open the list
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The only SQL in remote-filter: read and write the one settings row.

## Inlined context

> A singleton state row uses `id integer PK`, always `1`, upserted lazily with `onConflictDoNothing`, so there is no seed migration.
>
> — `data-model.md §Conventions, verbatim` · full text: [data-model.md](../data-model.md)

> **Access patterns:** read and written by PK only. It is read on every search, waiting poll and settings read (Flows 1–5), and written only by the owner's actions: choose or change the country, switch the filter, start or end a look (Flows 2–4). No secondary index.
>
> — `data-model.md §Entities, remote_filter_settings, verbatim` · full text: [data-model.md](../data-model.md)

> - `setRemoteFilterSettings(db, partial)` upserts the singleton row, to set up no-country, off, and look-in-this-visit / look-from-an-earlier-visit scenarios under a fake clock (AC-04, AC-06, AC-07).
>
> — `data-model.md §Test fixtures, verbatim` · full text: [data-model.md](../data-model.md)

> Inserting a row without `filter_on` fails with `SQLITE_CONSTRAINT_NOTNULL`. The lazy upsert must write `filter_on`.
>
> — `_audit/data-model-2026-10-14.md §Verification, verbatim` · full text: [_audit](../_audit/data-model-2026-10-14.md)

`infra` holds the one settings row. — `sad.md §5, verbatim` · `infra/` — `schema.ts (remote_filter_settings) · repo.ts (the only SQL in the module)` — `sad.md §5, Internal decomposition, verbatim`

> **Hard rule:** One connection shared by every module; calls are synchronous on the server's single event loop.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([data-model.md](../data-model.md) · [sad.md](../sad.md)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `id` | integer | PK, always `1` | read + written |
| `country` | text | nullable, ISO alpha-2 | read + written |
| `filter_on` | integer (boolean) | NOT NULL; `true` on lazy create | read + written |
| `look_country` | text | nullable | read + written |
| `look_started_at` | integer | nullable, epoch ms; cleared with `look_country` | read + written |

— `data-model.md §Entities, remote_filter_settings, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-04 — happy

> **Given** the owner has never chosen a country
> **When** they open the main screen, choose Poland, and later close and reopen the app
> **Then** before choosing they see every open posting with a prompt to choose their country; after choosing, the list is filtered for Poland; on reopening, Poland is still chosen and the filter is still on
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** the owner's country is Poland
> **When** they choose to see postings open to Germany
> **Then** the list shows the postings that fit or need a check for Germany under the same rules, the screen says it is showing postings open to Germany, the owner's saved country stays Poland, and the next time the main screen is opened it filters for Poland again; an owner who has not chosen a country yet can still look at Germany this way, and afterwards is back to the unfiltered list with the prompt to choose (AC-04)
>
> — `spec.md §5, AC-06, verbatim (note omitted)` · full text: [spec.md](../spec.md)

### AC-07 — happy

> **Given** the filter for Poland hides 38 of 140 open postings that match the owner's skills
> **When** the list is shown
> **Then** the owner sees "102 postings — 38 hidden, not open to Poland", pages through those 102 (search AC-15), and has one action to switch the filter off; switching it off shows all 140 without any "check" or hidden distinction, and the filter stays off on the next opening until the owner switches it on, with the screen saying the location filter is off and offering to switch it on
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

This task delivers the durable storage these ACs rest on; the rules are T07.

## Checklist

- [ ] `remote-filter/infra/repo.ts`: `readSettings(db)` (lazy insert `{ id: 1, filterOn: true }` with `onConflictDoNothing`, then select), `writeCountry(db, code, filterOn)`, `writeFilterOn(db, on)`, `writeLook(db, code | null, startedAt | null)`
- [ ] `apps/server/test/helpers/remote-filter-fixtures.ts`: `setRemoteFilterSettings(db, partial)`
- [ ] `apps/server/test/remote-filter-repo.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| First read on an empty table | Row created: country `NULL`, `filter_on` true, no look |
| Read twice | One row only (`onConflictDoNothing`) |
| Ending a look | `look_country` and `look_started_at` both `NULL` |
| Reopen the DB file (restart) | Values read back unchanged |

## Definition of Done

**Done when:** `remote-filter-repo.integration.test.ts` passes on a temp DB: lazy create, each write, look cleared as a pair, and values surviving a close-and-reopen of the DB file.

- [ ] `remote-filter-repo.integration.test.ts` passes
- [ ] `repo.ts` is the only file in `remote-filter/` with SQL
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
