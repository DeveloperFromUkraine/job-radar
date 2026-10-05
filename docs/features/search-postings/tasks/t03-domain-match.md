---
id: T3
title: "Match skills against posting text with exact-text boundaries and in-title flags"
layer: "domain"
deps: []
blocks: ["T7"]
acs: ["AC-02", "AC-06"]
files_hint: ["apps/server/src/modules/search/domain/match.ts", "apps/server/src/modules/search/domain/match.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 46
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T3 — Match skills against posting text with exact-text boundaries and in-title flags

## Place in the sequence

- **Blocked by:** — · **Blocks:** T7 — Run a search and keep its snapshot · **Wave:** 1 (pure domain, no deps).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** each posting in the list to show which of my skills it mentions, and whether in its title
> **So that** I can judge at a glance whether it is worth opening
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

The one pure matcher that decides which skills a posting mentions, and whether in a title.

## Inlined context

> **Chosen:** Option 1. It implements AC-02 exactly in one unit-tested function, needs no migration or trigger on the collector's tables, and is expected to fit the 1 s budget at 10,000 postings.
>
> — `adr/0002-match-skills-by-scanning-open-posting-text-in-the-app.md §Decision outcome, abridged` · full text: [ADR-0002](../adr/0002-match-skills-by-scanning-open-posting-text-in-the-app.md)

> AC-02's rule (exact text with symbols, any letter case, no letter or digit next to it) is one pure matcher in `search/domain`: skills are escaped and compiled into one case-insensitive Unicode pattern with boundary look-arounds, so owner input is never interpreted as a pattern (spec §6.1).
>
> — `sad.md §4, choice 2, abridged` · full text: [sad.md](../sad.md)

> **Matching rule** — Case-insensitive Unicode match of the skill's exact text in any open listing's title or description, with no letter or digit directly before it and no letter, digit, `#` or `+` directly after it — so `C` does not match `C#` or `C++` (AC-02 example). In-title when any open listing's title matches (AC-06). Closed listings never match
>
> — `sad.md §8, Matching rule, verbatim` · full text: [sad.md](../sad.md)

> **Binding rule:** sad §8 above. AC-02's sentence says "no letter or digit … before or after", which contradicts its own `C`/`C#` example; sad §11 records this (patch AC-02's wording). The tests encode the **examples** and the §8 rule.
>
> — `sad.md §11, row "Spec AC-02's rule text…", abridged`

> **Match correctness** — 100% of the fixed matching examples (AC-02) pass, each in title and in description
>
> — `spec.md §6, NFR Match correctness, verbatim`

> unit test over the example list against `search/domain/match.ts` (including `C`/`C#`, `.NET`/`ASP.NET`, `Go`/`Google`/`MongoDB`, `Java`/`JavaScript`, `Node.js`/`Node`, a phrase, and pattern-like input `C++`, `.*`, `(`, `%`)
>
> — `sad.md §10, QG-1 How verify, abridged` · full text: [sad.md](../sad.md)

Perf note: this runs over every open posting per search (≤ 1 s p95 at 10,000 postings, T10) — compile the pattern once per search, not per posting.

**Fallback:** [spec.md](../spec.md) · [sad.md](../sad.md) · [ADR-0002](../adr/0002-match-skills-by-scanning-open-posting-text-in-the-app.md). Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (Output becomes `matched_skills[{skill, in_title}]` in T7.)

## Acceptance criteria

### AC-02 — domain invariant

> **Given** a skill the owner entered
> **When** postings are matched against it
> **Then** it matches a posting when it is found in the title or description of any of the posting's open listings, and only where its exact text — symbols included, letter case ignored — stands in the title or description with no letter or digit directly before or after it: "Go" does not match "Google" or "MongoDB"; "Java" does not match "JavaScript"; "C#" matches "C#" but "C" does not match "C#"; ".NET" matches ".NET" but not "ASP.NET"; "Node.js" matches "Node.js" but not "Node"; "machine learning" matches only that phrase
>
> > Accepted noise: a short skill also matches unrelated words written the same way ("Go" in "go-to-market", "R" in "R&D"); the owner sees which skill matched (AC-06) and can enter a longer spelling ("Golang"). A fixed example list covering every case above is part of the tests.
>
> — `spec.md §5, AC-02 + note, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** a posting mentions "React" in its title and "TypeScript" only in its description, and the owner searched "React, TypeScript, Go"
> **When** the posting is shown in the list
> **Then** it shows "React" and "TypeScript" as matched — React marked as found in the title — in the owner's own spelling, and does not show "Go"; on a merged posting a skill counts as found in the title when any open listing's title has it
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `compileMatcher(skills)` → `match(openListings: {title, description}[]): {skill, in_title}[]` in `search/domain/match.ts`; result in the owner's spelling and search order.
- [ ] Escape every regex metacharacter; flags `iu`; look-behind `(?<![\p{L}\p{N}])`, look-ahead `(?![\p{L}\p{N}#+])`.
- [ ] `match.test.ts`: the fixed example table, each example once in a title and once in a description, plus the pattern-like inputs.

## Edge cases

| Case | Behaviour |
|---|---|
| `C` vs text `C#` / `C++` | no match |
| `.NET` vs `ASP.NET` | no match (`P` before `.`) |
| `Go` vs `go-to-market` | match (accepted noise) |
| `.*`, `(`, `%` as skills | matched literally, never throw |
| Skill only in a closed listing | not matched — caller passes open listings only |
| Empty skills list | no match computation (feed) — returns `[]` |

## Definition of Done

- [ ] 100% of the fixed AC-02 examples pass, in title and in description
- [ ] AC-06 in-title flag test passes, including a merged posting (title match in the second listing)
- [ ] lint + vet clean
