---
id: T2
title: "Enforce loopback-only, same-origin access in core and map Fastify 415"
layer: "ports"
deps: []
blocks: ["T18", "T19"]
acs: ["AC-17"]
files_hint: ["apps/server/src/core/access.ts", "apps/server/src/core/errors.ts", "apps/server/src/core/config.ts", "apps/server/src/app.ts", "apps/server/src/main.ts", "apps/web/vite.config.ts", "apps/server/test/access.integration.test.ts", "apps/server/test/app.smoke.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 46
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T2 — Enforce loopback-only, same-origin access in core and map Fastify 415

## Place in the sequence

- **Blocked by:** nothing — starts in wave 0 · **Blocks:** T18 — Serve getCollectorProblems and getSourceHealth, T19 — Serve collectNow and wire the collector plugin, scheduler and built SPA · **Wave:** 0 (no prerequisites).
- **Lane:** shares `apps/server/src/app.ts` with T19 — serialized.

## Why (user story)

> **As an** owner
> **I want** to start a collection myself
> **So that** I don't wait for the schedule after fixing a problem or before a job-hunting session
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Makes every collector control unreachable for a visitor and safe against cross-site requests, before any collector route exists.

## Inlined context

> **Chosen:** Option 1. Loopback binding meets AC-17 for other devices; the Host allowlist defeats DNS rebinding; requiring a JSON body forces a CORS preflight (a check browsers make before cross-site requests) that the server never approves, and `Sec-Fetch-Site` rejects the rest — together they defeat cross-site forgery without any login. Option 3 leaves both browser paths open; option 2 guards against other local processes, a threat outside the spec, at the cost of delivering a token to the SPA.
>
> — `adr/0007-allow-only-loopback-same-origin-requests-without-accounts.md §Decision outcome, Chosen, verbatim` · full text: [0007-allow-only-loopback-same-origin-requests-without-accounts.md](../adr/0007-allow-only-loopback-same-origin-requests-without-accounts.md)

> **Hard rule:**
>
> | Concept | Convention | Where defined |
> |---|---|---|
> | Access control | No accounts. Server binds loopback only and refuses to start otherwise; requests whose `Host` is not `127.0.0.1`/`localhost` on the configured port are rejected (DNS rebinding); state-changing requests require a JSON body and are rejected when `Sec-Fetch-Site` says `cross-site`; no CORS headers are emitted (CSRF) | [ADR-0007](adr/0007-allow-only-loopback-same-origin-requests-without-accounts.md), `apps/server/src/core/` |
>
> — `sad.md §8, Access control, verbatim` · full text: [sad.md](../sad.md)

> One Node.js process on the owner's laptop, listening only on `127.0.0.1:3000` (ADR-0007). It runs the Fastify API, the in-process collection runner (ADR-0001, ADR-0003) and — in normal use (`pnpm build` then `pnpm start`) — also serves the built SPA from `apps/web/dist` through `@fastify/static`, with any non-`/api` path falling back to `index.html` so client-side routes work: one origin, one process, no CORS. In development the Vite dev server (`localhost:5173`) serves the web app and proxies `/api` to the server, as the scaffold already does — with `changeOrigin: true` set on that proxy in `apps/web/vite.config.ts`, so forwarded requests carry `Host: 127.0.0.1:3000` and pass the Host check (ADR-0007). No replicas, no always-on host — collection happens only while the app runs (spec §3).
>
> — `sad.md §7, deployment paragraph, verbatim` · full text: [sad.md](../sad.md)

> - **AuthZ/AuthN impact:** no accounts; in v1 the whole app — including the collector's controls (collect-now, source health) — is reachable only on the owner's own machine, never from other devices on the network, the owner's phone included. Settings exist only as the local file; there is no settings control in the app.
>
> — `spec.md §6.1, AuthZ/AuthN impact, verbatim` · full text: [spec.md](../spec.md)

> | # | Finding | Resolution |
> |---|---|---|
> | F-2 | Fastify's own errors pass through `core/errors.ts` with their internal code (e.g. a missing JSON body becomes `FST_ERR_CTP_INVALID_MEDIA_TYPE`, 415) | `implement`: map Fastify 415 to `UNSUPPORTED_MEDIA_TYPE` in `registerErrorHandling`, and add a test for it |
>
> — `contracts/api-sync-report.md §Follow-ups, F-2, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Every route: `403 FORBIDDEN_HOST` when `Host` is not `127.0.0.1` / `localhost` on the configured port.
- State-changing routes: `403 CROSS_SITE_REQUEST` when `Sec-Fetch-Site: cross-site`; `415 UNSUPPORTED_MEDIA_TYPE` without a JSON body; `400 VALIDATION_ERROR` (existing).
- Envelope: `{ "error": { "code", "message" } }` — unchanged `core/errors.ts` shape.

— `contracts/openapi.yaml, components.responses.ForbiddenHost + operationId collectNow 403/415, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-17 — authorization

> **Given** a visitor can reach the owner's machine over the network
> **When** the visitor tries to start a collection or view source health
> **Then** they cannot — in v1 the whole app is reachable only on the owner's own machine, so any other device on the network, the owner's own phone included, cannot connect to it at all
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Refuse to start unless the configured host is loopback (`127.0.0.1` / `::1` / `localhost`) — `apps/server/src/main.ts`, `core/config.ts`
- [ ] `onRequest` hook: allow only `Host` `127.0.0.1:<port>` / `localhost:<port>`, else `AppError("FORBIDDEN_HOST", …, 403)` — `apps/server/src/core/access.ts`
- [ ] Same hook, non-GET/HEAD: reject `Sec-Fetch-Site: cross-site` with `CROSS_SITE_REQUEST` 403; emit no CORS headers — `core/access.ts`
- [ ] Map Fastify's 415 (`FST_ERR_CTP_INVALID_MEDIA_TYPE`, also missing body) to `UNSUPPORTED_MEDIA_TYPE` in `registerErrorHandling` + unit test — `apps/server/src/core/errors.ts`
- [ ] Register the hook in the composition root before modules — `apps/server/src/app.ts`
- [ ] Vite proxy `/api` with `changeOrigin: true` — `apps/web/vite.config.ts`
- [ ] Integration tests with `inject` + explicit `Host`; fix the existing smoke test's Host — `apps/server/test/access.integration.test.ts`, `test/app.smoke.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `Host: evil.example.test:3000` (DNS rebinding) | 403 `FORBIDDEN_HOST` |
| `Host: localhost:3000` | Allowed |
| POST with `Sec-Fetch-Site: cross-site` | 403 `CROSS_SITE_REQUEST` |
| POST with `Sec-Fetch-Site: same-origin` and `{}` | Allowed |
| POST with no body / `text/plain` | 415 `UNSUPPORTED_MEDIA_TYPE` |
| `HOST=0.0.0.0` | Server exits at start with a plain message |

## Definition of Done

- [ ] access integration tests pass (403 host, 403 cross-site, 415, allowed same-origin)
- [ ] start-up refusal on non-loopback host covered by a test
- [ ] existing smoke test green with an explicit Host
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
