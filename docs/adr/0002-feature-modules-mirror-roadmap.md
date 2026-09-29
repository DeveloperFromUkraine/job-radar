---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-09-29"
feature_size: ""
ticket: ""
---

# 0002 — Organize the server as feature modules that mirror the roadmap steps

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** Volodymyr Kozlov, with Claude during the survey foundation session

## Context

The roadmap runs steps in parallel waves (match score, remote filter and status tracking in one wave), each in its own lane. The code layout decides whether those lanes collide.

## Decision drivers

- Parallel roadmap steps must touch disjoint folders (roadmap.md §Execution path).
- Rules (scoring, remote classification) must be testable without the network or database.

## Considered options

1. **Feature modules** (`modules/<name>/{domain,app,infra,ports}`), one per roadmap zone, each a Fastify plugin; one shared error envelope in `core/`.
2. **Layer-first** (`routes/`, `services/`, `db/`) — simpler at first, but every step edits every folder, so parallel lanes conflict.

## Decision outcome

**Chosen:** Option 1. The roadmap zones map one-to-one onto module folders, so parallel steps never share files; the domain layer stays pure and unit-testable.

## Consequences

**Positive**
- Parallel work lands in separate folders.
- Each module is readable on its own.

**Negative**
- More folders and boilerplate than a tiny app strictly needs.

**Neutral**
- Modules call each other through `app` exports only; if that grows tangled, events can be introduced later.

## Links

- Roadmap: [[../roadmap.md]] §Execution path
- Map: [[../architecture-map.md]] §Module inventory
- Related ADR: [[0001-typescript-monorepo-react-fastify]]
