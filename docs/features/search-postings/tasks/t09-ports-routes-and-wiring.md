---
id: T9
title: "Expose the four search routes and wire the module on one shared DB handle"
layer: "ports"
deps: ["T8"]
blocks: ["T10"]
acs: ["AC-05", "AC-12", "AC-17"]
files_hint: ["apps/server/src/modules/search/ports/routes.ts", "apps/server/src/modules/search/index.ts", "apps/server/src/app.ts", "apps/server/src/main.ts", "apps/server/src/modules/collector/index.ts", "apps/server/test/helpers/contract.ts", "apps/server/test/search-routes.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 50
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T9 — Expose the four search routes and wire the module on one shared DB handle

## Place in the sequence

- **Blocked by:** T8 — Next pages and waiting count · **Blocks:** T10 — NFR and trust integration tests · **Wave:** 5.
- **Lane:** own lane. Only task that edits `app.ts`, `main.ts`, `collector/index.ts` and the server contract helper.

## Why (user story)

> **As an** owner
> **I want** to enter my skills and get the open postings that mention at least one of them, newest first
> **So that** I see the roles I could do without opening every board
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Puts the use cases (T6–T8) behind HTTP and makes search and collector share one SQLite connection.

## Inlined context

> **Database handle** — One `better-sqlite3` connection opened in `app.ts` and passed to both modules — no second connection, so no `SQLITE_BUSY` between search writes and collector transactions
>
> **Access control** — Unchanged: loopback bind, Host check, state-changing requests only same-origin with a JSON body, no CORS (AC-17). Search, next page, waiting count and visit all change state (snapshot, last skills, visit heartbeat), so all four are sent as JSON POSTs
>
> **Error handling** — Envelope `{ "error": { "code", "message" } }` via `AppError`; a failed skills check names the skill (or count) and the rule (AC-05); an unreadable collection is a plain-language error the web shows with a retry […]; an unknown snapshot has its own code so the web reloads from the newest
>
> — `sad.md §8, rows Database handle / Access control / Error handling, abridged` · full text: [sad.md](../sad.md)

> `ports/ routes.ts — search, next page, waiting count, visit` · `index.ts Fastify plugin` · `app.ts opens the one SQLite handle and passes it to both modules (was opened by the collector)`
>
> — `sad.md §5, internal decomposition, abridged`

Today `collectorModule` calls `openDb(options.databaseFile)` itself (`apps/server/src/modules/collector/index.ts`); move the open/close to `app.ts` and pass the handle to both plugins. `registerAccessGuard` already covers every route — do not add per-route guards.

Server contract helper (`apps/server/test/helpers/contract.ts`) is hard-wired to the collector's `openapi.yaml`; parametrize it by feature so search responses validate against `docs/features/search-postings/contracts/openapi.yaml`.

**Fallback:** [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) · collector [ADR-0007](../../remote-boards-collector/adr/0007-allow-only-loopback-same-origin-requests-without-accounts.md). Do not guess.

## Data delta

No DB changes.

## API contract

| operationId | Route | 200 | Errors |
|---|---|---|---|
| `openVisit` | `POST /api/v1/search/visits` body `{}` | `Visit` | 400, 403, 415, 500 |
| `runSearch` | `POST /api/v1/search/snapshots` body `{ skills: string }` | `SearchResult` | 400 `SEARCH_INVALID_SKILLS` / `VALIDATION_ERROR`, 403, 415, 500, 503 `SEARCH_COLLECTION_UNAVAILABLE` |
| `getNextPage` | `POST /api/v1/search/snapshots/{snapshot_id}/pages` body `{ cursor }` | `PostingPage` | 400, 403, 410 `SEARCH_SNAPSHOT_EXPIRED`, 415, 500, 503 |
| `getWaitingCount` | `POST /api/v1/search/snapshots/{snapshot_id}/waiting` body `{}` | `WaitingCount` | 400, 403, 410, 415, 500, 503 |

Bodies use `additionalProperties: false`; `snapshot_id` is `format: uuid`; `cursor` matches `^[0-9]{1,6}$`.

— `contracts/openapi.yaml, paths, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-05 — error

> **Given** the owner enters a skill with no letter or digit (for example "#" or "--"), a skill longer than 50 characters, or more than 20 skills
> **When** the owner searches
> **Then** the search does not run, the message under the skills field names the skill (or the count) and the rule it breaks, and the list on screen stays as it was
>
> — `spec.md §5, AC-05, verbatim`

### AC-12 — error

> **Given** the owner searches while job-radar cannot read its collection
> **When** the search fails
> **Then** the owner sees a plain-language message with a retry action next to the list, their skills stay in the field, and the last list shown stays visible
>
> — `spec.md §5, AC-12, verbatim`

### AC-17 — authorization

> **Given** a visitor can reach the owner's machine over the network
> **When** the visitor tries to search postings or open the main screen
> **Then** they cannot — in v1 the whole app is reachable only on the owner's own machine, so another device cannot connect to it at all
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `search/ports/routes.ts`: four POST routes with JSON schemas; map use-case results to the contract.
- [ ] `search/index.ts`: `searchModule({ db, now? })` Fastify plugin, logger child `module=search`.
- [ ] `app.ts`: open one `DbHandle` when a database file is given, pass it to `collectorModule` and `searchModule`, close it on `onClose`; adjust `collector/index.ts` to take the handle; `main.ts` unchanged except options.
- [ ] Parametrize `test/helpers/contract.ts` by contract path.
- [ ] `apps/server/test/search-routes.integration.test.ts`: every route's 200 validates against the contract; 400/410/503; foreign Host → 403; cross-site → 403; no JSON body → 415.

## Edge cases

| Case | Behaviour |
|---|---|
| Body `{}` to `runSearch` | 400 `VALIDATION_ERROR` |
| `snapshot_id` not a UUID | 400 `VALIDATION_ERROR` |
| Foreign `Host` header | 403 `FORBIDDEN_HOST` |
| `Sec-Fetch-Site: cross-site` | 403 `CROSS_SITE_REQUEST` |
| Server closes | collector stops first, then the shared handle closes once |

## Definition of Done

- [ ] route tests pass; every 2xx body validates against the search `openapi.yaml`
- [ ] all existing collector integration tests still pass on the shared handle
- [ ] exactly one `openDb` call in the server's runtime path
- [ ] lint + vet clean
