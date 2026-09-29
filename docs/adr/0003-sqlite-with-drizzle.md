---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-09-29"
feature_size: ""
ticket: ""
---

# 0003 — Store data in a local SQLite file through Drizzle ORM with UUIDv7 IDs

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** Volodymyr Kozlov, with Claude during the survey foundation session

## Context

The tool is personal and runs on the owner's laptop, but the brief keeps a later multi-user product open. Postings, scores, statuses and saved searches need durable storage with no database server to operate.

## Decision drivers

- Zero infrastructure for a personal tool (idea-brief.md §3 Users).
- A path to a server database if it becomes a product (idea-brief.md §8 Open questions).
- Newest-first ordering is the main read pattern (roadmap.md step 3).

## Considered options

1. **SQLite file + Drizzle ORM + drizzle-kit migrations, UUIDv7 IDs** — nothing to run, typed schema, Drizzle also supports Postgres.
2. **Postgres in Docker** — closer to a product, but Docker must run for development and tests.

## Decision outcome

**Chosen:** Option 1. Nothing to install or run beyond the app, integration tests use a real temporary file, and Drizzle keeps a later Postgres move open. UUIDv7 IDs sort by creation time.

## Consequences

**Positive**
- No database server; integration tests are fast and real.
- Typed schema shared by queries and migrations.

**Negative**
- drizzle-kit migrations are forward-only; rollback means restoring the database file backup.
- A move to Postgres later needs a data migration and some dialect-specific fixes.

**Neutral**
- Single-writer SQLite is fine for one user; multi-user would revisit this ADR.

## Links

- Map: [[../architecture-map.md]] §Datastores
- Related ADR: [[0001-typescript-monorepo-react-fastify]]
