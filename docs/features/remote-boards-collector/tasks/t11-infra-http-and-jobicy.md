---
id: T11
title: "Build the ledgered HTTP client and the Jobicy adapter"
layer: "infra"
deps: ["T1", "T3", "T5"]
blocks: ["T12", "T14"]
acs: ["AC-01", "AC-03"]
files_hint: ["apps/server/src/modules/collector/infra/http.ts", "apps/server/src/modules/collector/infra/repo/sources.ts", "apps/server/src/modules/collector/infra/sources/jobicy.ts", "apps/server/test/fixtures/sources/jobicy/"]
owner: "Volodymyr Kozlov"
estimate: "L"
context_budget: "M"
# measured inlined lines: 57
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Build the ledgered HTTP client and the Jobicy adapter

## Place in the sequence

- **Blocked by:** T1 — Promote the collector schema: Drizzle schema.ts + generated migration 0001, T3 — Model the source registry, due-ness and rolling-window rate limits, T5 — Define the adapter contract and normalize listings (plain text, location as stated, category filter) · **Blocks:** T12 — Verify spec §8 Q1/Q3, then build the Remotive, Himalayas and We Work Remotely adapters, T14 — Ingest each due source and merge its listings in one transaction · **Wave:** 1 (after T1, T3, T5).
- **Lane:** shares `apps/server/src/modules/collector/infra/repo/sources.ts` with T13; shares `apps/server/src/modules/collector/infra/repo/sources.ts` with T15; shares `apps/server/src/modules/collector/infra/repo/sources.ts` with T16 — serialized.

## Why (user story)

> **As an** owner
> **I want** new remote tech postings collected from every enabled source on that source's own schedule
> **So that** I never have to open the boards to see what is new
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Gives the collector its first source and the one safe way to call any source.

## Inlined context

> **Hard rule:**
>
> | Concept | Convention | Where defined |
> |---|---|---|
> | Outbound HTTP | Node's built-in `fetch`; User-Agent `job-radar (personal use)`; every request is written to the request ledger before it is sent; a source is read only once its interval has passed; a retry happens only if the source's window still allows it, and a limit used up mid-fetch makes that fetch `partial` — never a closure, never an AC-13 failure (spec §6) | `collector/infra/http.ts`, ADR-0003 |
>
> — `sad.md §8, Outbound HTTP, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:**
>
> | Concept | Convention | Where defined |
> |---|---|---|
> | Untrusted source content | Each adapter validates the response shape against a schema; responses above 10 MB or slower than 30 s are rejected as `failed` (spec §6.1 oversized/malformed); HTML in titles and descriptions is converted to plain text at ingest and stored only as text; the web app renders it as text, never as markup (`dangerouslySetInnerHTML` is not used) | here |
>
> — `sad.md §8, Untrusted source content, verbatim` · full text: [sad.md](../sad.md)

> | Source | Completeness | Closing signal | Never closes on |
> |---|---|---|---|
> | Jobicy | `complete` within the window when the response has fewer items than requested, else `capped` | absent from a complete response and published after (now − 7 days + 12 h) | a listing older than the window; a capped response |
>
> — `adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md §Decision outcome, Jobicy row, verbatim` · full text: [0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md](../adr/0004-normalize-sources-through-one-adapter-contract-with-per-source-close-signals.md)

> Himalayas, Remotive, Jobicy and Remote OK require linking back and naming the source; never republish their
> postings elsewhere.
>
> — `CLAUDE.md §Source terms, verbatim` · full text: [CLAUDE.md](../../../../CLAUDE.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

**`collector_request_ledger`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | text | PK, UUIDv7 | |
| `source_id` | text | NOT NULL, FK → `collector_sources(id)` ON DELETE CASCADE | |
| `sent_at` | integer | NOT NULL | Written before the request is sent, so a crash still counts the read (ADR-0003, AC-20). Pages, fill reads and failed requests all count. |

— `data-model.md §Entities, table collector_request_ledger, verbatim` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy

> **Given** an enabled source is due and offers a new listing in one of the owner's tech categories
> **When** the collection run reads that source
> **Then** a new posting appears in the owner's collection with its title, company, publication time, the source's name and a link back to the source
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** one enabled source cannot be reached, refuses the request, or returns something that cannot be read
> **When** the collection run reads it
> **Then** the other sources are still collected, no posting from the failing source is closed, and that source's health shows the failure with a plain-language reason
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `fetchSource()` — write the ledger row (+ `collector_sources.last_read_at`) before sending; `AbortController` 30 s; stream with a 10 MB cap; User-Agent `job-radar (personal use)` — `infra/http.ts`, `infra/repo/sources.ts`
- [ ] Map unreachable / refused / oversized / slow / unreadable to `failed` with a reason code the domain turns into plain words — `infra/http.ts`
- [ ] Ledger window counts per source for `windowAllows` (T3) — `infra/repo/sources.ts`
- [ ] Jobicy adapter: owner's tech categories, newest first; `complete` when fewer items than requested, else `capped`; close signals per ADR-0004 — `infra/sources/jobicy.ts`
- [ ] Recorded fixtures (complete, capped, failed, malformed) with `example.test` companies and links — `apps/server/test/fixtures/sources/jobicy/`
- [ ] Tests against a local fake HTTP server — `apps/server/test/collector-http.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Response > 10 MB | `failed`, reason: response too large |
| No answer in 30 s | `failed`, reason: timed out |
| Malformed JSON / unexpected shape | `failed`, reason: unreadable — nothing closed |
| 429 / 403 | `failed`, reason: refused |
| Process dies after the ledger write | The read still counts |

## Definition of Done

- [ ] http integration tests pass against the fake server
- [ ] Jobicy adapter tests pass on every recorded fixture
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `tsc`)
