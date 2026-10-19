# job-radar

Personal tool that collects global-remote job postings, scores them against the owner's profile with Claude,
and tracks applied / skipped status. Source of truth for architecture: `docs/architecture-map.md` + `docs/adr/`.

## Commands

Node 22+ (`.nvmrc`), pnpm via corepack (`corepack enable`).

| What | Command |
|---|---|
| Install | `pnpm install` |
| Build (both apps) | `pnpm build` |
| Test (Vitest, both apps) | `pnpm test` |
| Lint + format check (Biome) | `pnpm lint` · autofix: `pnpm format` |
| Dev servers | `pnpm dev` (server :3000, web via Vite with `/api` proxied to the server) |
| Run it locally, one command | `pnpm start:local` (install, build web, pending migrations, server :3000 with `.env.ship`) |
| Generate a migration | `pnpm --filter @job-radar/server db:generate` |
| Apply migrations | `pnpm --filter @job-radar/server db:migrate` |
| Match-score evaluation (real model, ~$1–2; before ship and after any prompt / schema / model change) | `cd apps/server && npx tsx scripts/eval-match-score.ts --real` (`--dry-run` is free) |

## Configuration

- **Match scoring** reads the provider key only from `ANTHROPIC_API_KEY` in your local environment —
  never commit it, and it is never shown, stored or logged. Without it scoring shows "not scored" with
  the reason; restart with the key to resume. Also set a spending limit in your provider account: the
  in-app scoring cap bounds only job-radar's own spending, not a leaked key.
- Optional overrides: `MATCHING_MODEL` (default `claude-opus-5-5`), `MATCHING_PRICE_*` (dollars per
  million tokens, used for the cap).

## Layout

- `apps/server/src/app.ts` — composition root; registers every module plugin.
- `apps/server/src/core/` — config, DB client (`db.ts`), error envelope (`errors.ts`), ID helper (`id.ts`).
- `apps/server/src/modules/<name>/` — one module per roadmap capability; `health/` is the reference shape.
- `apps/server/drizzle/` — generated SQL migrations. `apps/server/test/` — integration tests.
- `apps/web/src/` — React + Vite UI; shared components in `apps/web/src/components/`.

## Conventions (ADRs 0001–0003)

- **Modules:** each module exports a Fastify plugin from `index.ts`; `app.ts` registers it.
- **Layering:** `domain/` (pure types + rules, no I/O) → `app/` (use cases) → `infra/` (DB, HTTP clients) /
  `ports/` (HTTP routes). Modules call each other only through another module's `app/` exports — never its `infra/`.
- **Errors:** every error response is `{ "error": { "code", "message" } }`, shaped only by
  `registerErrorHandling` in `core/errors.ts`. Throw `AppError(code, message, status)` for expected failures.
- **IDs:** `newId()` from `core/id.ts` (UUIDv7, time-sortable) — generated in the app, never by the DB.
- **Persistence:** Drizzle schema per module in `<module>/infra/schema.ts`; queries only inside `infra/`.
  Business rules live in `domain/`, not in the DB.
- **Migrations:** `db:generate` after a schema change; forward-only. `db:migrate` backs up the SQLite file
  first — rollback = restore that `*.bak-*` file.
- **Tests:** Vitest. Unit tests next to the code (`*.test.ts`); server integration tests in `apps/server/test/`
  against a real temp SQLite file (`test/helpers/temp-db.ts`); web tests with Testing Library.
- **UI:** Tailwind v4, mobile-first (unprefixed = phone, `md:`/`lg:` add). Colors/fonts only via the semantic tokens in
  `apps/web/src/styles/tokens.css` — no raw hex or stock palette. Design canon + component inventory: `docs/design-system.md`.

## Source terms

Himalayas, Remotive, Jobicy, We Work Remotely and Remote OK require linking back and naming the source; never republish their
postings elsewhere.
