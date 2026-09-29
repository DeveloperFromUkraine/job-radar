---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-09-29"
feature_size: ""
ticket: ""
---

# 0001 — Build both apps in TypeScript as a pnpm monorepo with React + Vite and Fastify

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** Volodymyr Kozlov, with Claude during the survey foundation session

## Context

The repo is empty. The idea brief asks for a personal tool that collects remote postings in the background and shows a scored list on request; the owner chose a local web app as the interface. The stack has to serve a browser UI, an HTTP API and a scheduled collector, and later possibly a multi-user product.

## Decision drivers

- One person builds it: one language across UI and server keeps the toolchain small (idea-brief.md §3 Users).
- The owner already knows React (from the interview's skill example).
- Background collection must live next to the API (idea-brief.md §7 Recommendation).

## Considered options

1. **TypeScript monorepo: React + Vite web, Fastify server** — one language, collector runs in the server process.
2. **Python server (FastAPI) + React web** — richer data tooling, but two languages and two toolchains.
3. **Next.js single app** — fewer moving parts, but scheduled background work is unnatural there.

## Decision outcome

**Chosen:** Option 1. It keeps one language and one test tool (Vitest) across the repo, fits the owner's React background, and hosts the scheduler naturally in a long-running server.

## Consequences

**Positive**
- One toolchain: pnpm, TypeScript, Vitest, Biome.
- Shared types between web and server are possible later.

**Negative**
- Two apps to run locally during development.
- Weaker data-processing ecosystem than Python, should heavy text processing appear.

**Neutral**
- Requires Node.js 22+; the local machine needs an upgrade from Node 20.

## Links

- Brief: [[../idea-brief.md]] §7
- Map: [[../architecture-map.md]] §Stack
- Related ADR: [[0002-feature-modules-mirror-roadmap]], [[0003-sqlite-with-drizzle]]
