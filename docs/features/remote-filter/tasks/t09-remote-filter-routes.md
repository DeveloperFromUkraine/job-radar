---
id: T09
title: "Expose remote-filter's four routes behind the access guard and register the plugin in app.ts"
layer: "ports"
deps: ["T07"]
blocks: ["T13"]
acs: ["AC-04", "AC-05", "AC-06", "AC-07", "AC-12", "AC-13"]
files_hint: ["apps/server/src/modules/remote-filter/ports/routes.ts", "apps/server/src/modules/remote-filter/index.ts", "apps/server/src/app.ts", "apps/server/test/remote-filter-routes.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T09 — Expose remote-filter's four routes behind the access guard and register the plugin in app.ts

## Place in the sequence

- **Blocked by:** T07 — Implement the settings use cases · **Blocks:** T13 — Prove the cross-context ACs and speed with the filter on · **Wave:** 4.
- **Lane:** own lane (only task touching `app.ts`).

## Why (user story)

> **As an** owner
> **I want** to choose my country once and have job-radar remember it
> **So that** the filter works every time I open the list
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The HTTP surface the web app uses to read and change the country, the on/off state and the look — and nobody else can.

## Inlined context

> | Access control | Unchanged: loopback bind, Host check, and state-changing requests accepted only same-origin with a JSON body; no CORS. Setting the country and switching the filter are JSON POSTs behind the global guard (AC-12) | collector ADR-0007, `core/access.ts` |
>
> — `sad.md §8, Access control, verbatim` · full text: [sad.md](../sad.md)

> `getRemoteFilterSettings` is a GET — Read-only. The access guard lets safe methods through (`core/access.ts` `SAFE_METHODS`), as the collector's two GETs do. No CORS, so another site cannot read the response (AC-12). Like `search_state`, the row is created lazily on first read.
>
> — `contracts/api-sync-report.md §Deviations, abridged` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> `ports/routes.ts` — settings + countries, set country, switch on/off · `index.ts` — Fastify plugin · `app.ts` — registers remote-filter
>
> — `sad.md §5, Internal decomposition, abridged` · full text: [sad.md](../sad.md)

> An integration test sending remote-filter's routes a request with a foreign Host and one marked cross-site. Both are refused, and the settings row is unchanged.
>
> — `sad.md §10, QG-5 How verify, verbatim` · full text: [sad.md](../sad.md)

Contract tests validate responses with `apps/server/test/helpers/contract.ts` (Ajv 2020) against this feature's `contracts/openapi.yaml` — as the tracking and search route tests do.

> **Hard rule:** Errors use one envelope `{ "error": { "code", "message" } }`, shaped only by `core/errors.ts`; expected failures throw `AppError(code, message, status)`.
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([openapi.yaml](../contracts/openapi.yaml) · [sad.md](../sad.md) · [spec.md](../spec.md)) and follow it. Do not guess.

## Data delta

No DB changes (the row is read and written through T07/T06).

## API contract

- `GET /api/v1/remote-filter/settings` (`getRemoteFilterSettings`) → `200 RemoteFilterSettings` · errors `403`, `500`.
- `POST /api/v1/remote-filter/country` (`chooseCountry`) body `{ name: string 1..100 }` → `200 RemoteFilterSettings` · errors `400 REMOTE_FILTER_UNKNOWN_COUNTRY`, `403`, `415`, `500`.
- `POST /api/v1/remote-filter/filter` (`setFilterOn`) body `{ on: boolean }` → `200 RemoteFilterSettings` · errors `400 VALIDATION_ERROR`, `403`, `415`, `500`.
- `POST /api/v1/remote-filter/look` (`setLook`) body `{ name: string 1..100 | null }` → `200 LookState { look: Country|null }` · errors `400 REMOTE_FILTER_UNKNOWN_COUNTRY`, `403`, `415`, `500`.
- All bodies `additionalProperties: false`. `403` = `FORBIDDEN_HOST` or `CROSS_SITE_REQUEST`; `415` = `UNSUPPORTED_MEDIA_TYPE`.

— `contracts/openapi.yaml, paths /api/v1/remote-filter/*, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-04 — happy

> **Given** the owner has never chosen a country
> **When** they open the main screen, choose Poland, and later close and reopen the app
> **Then** before choosing they see every open posting with a prompt to choose their country; after choosing, the list is filtered for Poland; on reopening, Poland is still chosen and the filter is still on
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — error

> **Given** the owner is choosing their country
> **When** they type a name that is not a country job-radar knows (for example "Polnd" or "Europe")
> **Then** no country is chosen, they are told that no country matches that name, and the list and the saved country stay as they were
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** the owner's country is Poland
> **When** they choose to see postings open to Germany
> **Then** the list shows the postings that fit or need a check for Germany under the same rules, the screen says it is showing postings open to Germany, the owner's saved country stays Poland, and the next time the main screen is opened it filters for Poland again; an owner who has not chosen a country yet can still look at Germany this way, and afterwards is back to the unfiltered list with the prompt to choose (AC-04)
>
> — `spec.md §5, AC-06, verbatim (note inlined in T07)` · full text: [spec.md](../spec.md)

### AC-07 — happy

> **Given** the filter for Poland hides 38 of 140 open postings that match the owner's skills
> **When** the list is shown
> **Then** the owner sees "102 postings — 38 hidden, not open to Poland", pages through those 102 (search AC-15), and has one action to switch the filter off; switching it off shows all 140 without any "check" or hidden distinction, and the filter stays off on the next opening until the owner switches it on, with the screen saying the location filter is off and offering to switch it on
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — authorization

> **Given** a visitor can reach the owner's machine over the network, or the owner opens a web page from another site in the same browser
> **When** the visitor or that page tries to open the main screen, read or change the owner's country, the mode or the filter
> **Then** they cannot — as with search (search AC-17) the whole app is reachable only on the owner's own machine, and as with marks (applied-skipped AC-16) another site cannot change the owner's settings, so nobody else can hide postings from the owner
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy

> **Given** the owner's country is Poland
> **When** they change it to Portugal
> **Then** the list is filtered for Portugal at once, Portugal is remembered for the next opening, and the filter is switched on if the owner had it off
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `remote-filter/ports/routes.ts`: four routes with JSON schemas from the contract; map to T07's use cases
- [ ] `remote-filter/index.ts`: Fastify plugin (`module=remote-filter` child logger)
- [ ] `apps/server/src/app.ts`: register the plugin
- [ ] `apps/server/test/remote-filter-routes.integration.test.ts`: each operation's 200/400/415 validated against the contract; foreign Host → 403 `FORBIDDEN_HOST`; `Sec-Fetch-Site: cross-site` POST → 403 `CROSS_SITE_REQUEST`; settings row unchanged after each refusal

## Edge cases

| Case | Behaviour |
|---|---|
| `{ name: "" }` or 101 chars | 400 `VALIDATION_ERROR` |
| Extra body field | 400 `VALIDATION_ERROR` |
| No JSON body on a POST | 415 |
| Cross-site POST to `/country` | 403, row unchanged |

## Definition of Done

**Done when:** `remote-filter-routes.integration.test.ts` validates every response against `contracts/openapi.yaml` and proves both AC-12 refusals leave the row unchanged.

- [ ] `remote-filter-routes.integration.test.ts` passes
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
