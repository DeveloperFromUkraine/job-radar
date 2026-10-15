---
id: T14
title: "Add the hidden count and one-off look to CONTEXT.md, amend the collector spec's \"Anywhere\" reading, and point applied-skipped's contract at this one"
layer: "docs"
deps: []
blocks: []
acs: ["AC-10"]
files_hint: ["CONTEXT.md", "docs/features/remote-boards-collector/spec.md", "docs/features/applied-skipped/contracts/openapi.yaml"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T14 — Add the hidden count and one-off look to CONTEXT.md, amend the collector spec's "Anywhere" reading, and point applied-skipped's contract at this one

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** 1 (docs only).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** a posting its board marks as open "Anywhere" to count as open to my country
> **So that** the most open roles are not the ones carrying a "check" mark
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Keeps the upstream documents this feature amends from contradicting it.

## Inlined context

> | Hidden count | How many matching postings the filter left out as not open to the country (AC-07). *Not yet in CONTEXT — glossary follow-up.* |
> | One-off look | "Open to country X": the same rules for another country until "back" or a new visit, without changing the owner's country; kept on the server, so a reload keeps it (AC-06). *Not yet in CONTEXT — glossary follow-up.* |
>
> — `sad.md §12, Glossary, verbatim` · full text: [sad.md](../sad.md)

> This replaces the collector's earlier reading — the AC-22 note (Jobicy's "Anywhere" recorded as unknown, citing Jobicy's docs: "`Anywhere` when no region is specified"; review B11) and §8 Q1 (We Work Remotely's "Anywhere in the World" counted as nothing stated) — and narrows collector US-07's "never mistakes a missing restriction for 'work from anywhere'": a source that states nothing at all is still unknown (collector AC-22); only an explicit "Anywhere" is read as open.
>
> — `spec.md §5, AC-10 note, abridged` · full text: [spec.md](../spec.md)

> These restatements supersede the matching operations in `docs/features/applied-skipped/contracts/openapi.yaml`, which superseded search-postings'.
>
> — `contracts/openapi.yaml, info.description, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

Already done upstream (do not redo): roadmap step 5 re-size and wave note — `docs/roadmap.md:67`.

**Fallback:** insufficient or contradicted by the docs → read the named file in full and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface (a pointer note in applied-skipped's contract only).

## Acceptance criteria

### AC-10 — cross-context

> **Given** a source states only "Anywhere" or "Anywhere in the World" for a listing
> **When** the listing is collected
> **Then** the location restriction is kept as the source stated it ("Anywhere" is what the owner sees) and the filter reads it as Worldwide, so the posting fits for any country; for merging it still counts as stating nothing, so it never keeps two listings of the same role apart (collector AC-05); when the same source lists countries beside "Anywhere", the countries are the statement; a listing already held as unknown takes the new reading the next time its source offers it, and that change is not counted as an updated posting or in source health, since the source changed nothing; when countries stand beside "Anywhere", the whole statement is kept and shown as stated, and the filter reads only the countries
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `CONTEXT.md`: add "Hidden count" and "One-off look" (one line each, with the NOT-reference: hidden count is NOT the marked count; a one-off look is NOT a change of the owner's country)
- [ ] `docs/features/remote-boards-collector/spec.md`: under AC-22 and §8 Q1, an "Amended by remote-filter AC-10 (2026-10-14)" line; same at US-07
- [ ] `docs/features/applied-skipped/contracts/openapi.yaml`: on `runSearch`, `getNextPage`, `getWaitingCount`, a description line "Superseded by docs/features/remote-filter/contracts/openapi.yaml"

## Edge cases

| Case | Behaviour |
|---|---|
| A term already in CONTEXT.md with another meaning | stop and ask the owner; do not overwrite |

## Definition of Done

**Done when:** `grep -n "Hidden count\|One-off look" CONTEXT.md` shows both entries, the collector spec carries the three amendment lines, and the applied-skipped contract still passes `redocly lint` with the three supersede notes.

- [ ] the three greps / lint above pass
- [ ] every Hard Rule inlined above still holds
