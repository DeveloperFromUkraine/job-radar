---
id: T07
title: "Add the realness module with its switch: settings repo, GET/POST /api/v1/realness/settings, registration"
layer: "ports"
deps: ["T01"]
blocks: ["T08"]
acs: ["AC-10", "AC-11", "AC-12"]
files_hint: ["apps/server/src/modules/realness/index.ts", "apps/server/src/modules/realness/app/deps.ts", "apps/server/src/modules/realness/app/settings.ts", "apps/server/src/modules/realness/infra/repo.ts", "apps/server/src/modules/realness/ports/routes.ts", "apps/server/src/app.ts", "apps/server/test/realness-routes.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T07 — Add the realness module with its switch: settings repo, GET/POST /api/v1/realness/settings, registration

## Place in the sequence

- **Blocked by:** T01 — Promote the staged schema: pay_field, reopened_at and the three realness tables · **Blocks:** T08 — Implement assess(): work out penalty and signals for a set of postings with switch-on rules · **Wave:** 2.
- **Lane:** shares `apps/server/src/modules/realness/app/deps.ts` with T08 — serialized; shares `apps/server/src/app.ts`, `apps/server/src/modules/realness/index.ts`, `apps/server/src/modules/realness/infra/repo.ts` with T09 — serialized; shares `apps/server/src/app.ts` with T10 — serialized.

## Why (user story)

> **As a** owner
> **I want** to switch the realness penalty off and on again
> **So that** I can see the plain best-match order when I doubt the signals
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task gives the owner the one switch, kept for the next opening, and the module that every later realness task fills in.

## Inlined context

> **Chosen:** option 1. It follows the one-step-one-module convention, keeps search's ordering change to a penalty it reads, and breaks the only cycle — tracking → realness → tracking — with one injected hook, the same composition-root pattern match-score ADR-0004 uses.
>
> — `adr/0001, Decision outcome, verbatim` · full text: [0001-ship-realness-as-a-new-realness-module-read-by-search-and-told-of-marks-by-tracking.md](../adr/0001-ship-realness-as-a-new-realness-module-read-by-search-and-told-of-marks-by-tracking.md)

> apps/server/src/modules/realness/
> ├── domain/       signals (age basis, many boards, repost, no salary), penalty (points, larger-of-time rule, cap 30),
> │                 amount parser (pay vs non-pay amounts) + labelled fixture set (≥ 100 postings), calendar-day count
> ├── app/          assess(postings, now) → Map<id, {penalty, signals}> with switch-on rules, never reading the switch; isOn(); setOn();
> │                 noteListShown(day, assessments, filterMode) from those switch-on values;
> │                 onMarkChanged(postingId, mark | null)
> ├── infra/        schema (realness_settings singleton, realness_mark_records, realness_daily_shares), repo
> ├── ports/        routes: GET + POST /api/v1/realness/settings
> └── index.ts      createRealness(deps) → { plugin, onMarkChanged } registered in app.ts
>
> — `sad.md §5, Internal decomposition (realness), verbatim` · full text: [sad.md](../sad.md)

> | Access | Loopback only, same-origin, JSON body on every state-changing request; applies unchanged to the realness switch (AC-12) | `core/access.ts`, collector ADR-0007 |
>
> — `sad.md §8, Access row, verbatim` · full text: [sad.md](../sad.md)

> Assumed: the switch is a `realness_settings` singleton (NULL = on) behind `POST /api/v1/realness/settings {on}`, mirroring `remote-filter/filter`. The web saves first, then reruns search; on failure the switch reverts, the list keeps its order, and an inline error offers a retry.
>
> — `sad.md §4, Assumptions ledger, verbatim` · full text: [sad.md](../sad.md)

> | Error handling | Expected failures throw `AppError(code, message, status)`; one envelope `{ "error": { "code", "message" } }`. A failed switch save is an error the web shows inline with a retry (AC-11) | `core/errors.ts`, `CLAUDE.md` |
>
> — `sad.md §8, Error handling row, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Null | Change |
|---|---|---|---|
| `realness_settings.id` | integer PK | no | read/upsert — always 1 |
| `realness_settings.realness_on` | integer (boolean) | no | read; upserted by POST. No row = on |

— `data-model.md §realness_settings, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `GET /api/v1/realness/settings` (`getRealnessSettings`) → `200 { realness_on: boolean }` · errors: `403 Forbidden`, `500 Internal`. Reading creates nothing.
- `POST /api/v1/realness/settings` (`setRealnessOn`) body `{ on: boolean }` (`additionalProperties: false`) → `200 { realness_on }` · errors: `400 ValidationError`, `403 Forbidden`, `415 UnsupportedMediaType`, `500 Internal`, `503 REALNESS_SETTINGS_UNAVAILABLE` "Job-radar could not save your realness choice just now. Try again." Saving the current state again is a no-op.

— `contracts/openapi.yaml, operationIds getRealnessSettings + setRealnessOn + responses.RealnessNotSaved, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-10 — happy

> **Given** realness is on
> **When** the owner switches it off
> **Then** best match first orders by match score alone (match-score AC-11), no card in either order shows a "Lowered" or a "Signals" line, and the choice is kept for the next opening; switching it on again restores the penalty and the reason lines at once; realness is on when the owner first opens the list after this ships
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — error

> **Given** the owner switches realness off or on
> **When** job-radar cannot save the choice
> **Then** the switch returns to its previous state, the list keeps its previous order, and the owner sees that the choice was not saved and can try again
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — authorization

> **Given** a visitor can reach the owner's machine over the network, or the owner opens a web page from another site in the same browser
> **When** the visitor or that page tries to switch realness off or on, or to read the list with its reasons
> **Then** it cannot — as with search (search AC-17) the whole app is reachable only on the owner's own machine, and as with marks (applied-skipped AC-16) another site cannot act on the owner's behalf
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Scaffold `modules/realness/{app/deps.ts, infra/repo.ts, app/settings.ts, ports/routes.ts, index.ts}` mirroring `remote-filter` (deps: `db`, `now`, `timeZone`, `log`)
- [ ] `isOn()` → no row = `true`; `setOn(on)` upserts row 1; a write failure becomes `AppError("REALNESS_SETTINGS_UNAVAILABLE", …, 503)` — `app/settings.ts`, `infra/repo.ts`
- [ ] Routes with JSON-schema body validation as `remote-filter/ports/routes.ts` does — `ports/routes.ts`
- [ ] `createRealness(deps)` → `{ plugin, … }`; create it in `apps/server/src/app.ts` **before** `createTracking` (T09 hands tracking its hook) and register the plugin
- [ ] Integration test with `loadContract("realness-score")` — `apps/server/test/realness-routes.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Never chosen (no row) | GET → `realness_on: true`, and no row is created |
| POST `{on: false}` twice | second is a no-op, still 200 |
| POST `{on: "no"}` or extra keys | 400 ValidationError |
| DB write throws | 503 `REALNESS_SETTINGS_UNAVAILABLE`, stored value unchanged |
| Host not loopback / cross-site Origin / no JSON body | 403 / 403 / 415 via `core/access.ts` |

## Definition of Done

- [ ] routes test passes, all bodies validated against `realness-score` contract
- [ ] choice survives an app restart on the same DB file
- [ ] `app.smoke.test.ts` still passes
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
