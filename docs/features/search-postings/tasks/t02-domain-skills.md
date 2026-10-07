---
id: T2
title: "Parse and check the owner's skills (split, trim, dedupe, AC-05 rules)"
layer: "domain"
deps: []
blocks: ["T7"]
acs: ["AC-05"]
files_hint: ["apps/server/src/modules/search/domain/skills.ts", "apps/server/src/modules/search/domain/skills.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "S"
# measured inlined lines: 30
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T2 — Parse and check the owner's skills (split, trim, dedupe, AC-05 rules)

## Place in the sequence

- **Blocked by:** — · **Blocks:** T7 — Run a search and keep its snapshot · **Wave:** 1 (pure domain, no deps).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to enter my skills and get the open postings that mention at least one of them, newest first
> **So that** I see the roles I could do without opening every board
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Turns the raw skills text into a checked, deduped list — or a refusal that names the skill and the rule.

## Inlined context

> **Owner input** — Skills split on commas, trimmed, empties dropped, deduped ignoring letter case (first spelling kept); refused when a skill has no letter or digit, is over 50 characters, or there are over 20 skills (AC-05). Each skill is escaped before it joins the match pattern — never a pattern, SQL or command (spec §6.1)
>
> — `sad.md §8, Owner input, verbatim` · full text: [sad.md](../sad.md)

> `domain` holds every rule that an acceptance criterion states, pure and clock-injected
>
> — `sad.md §5, intro, abridged` · full text: [sad.md](../sad.md)

Messages (the API passes them through as `SEARCH_INVALID_SKILLS`, T9): `"--" needs at least one letter or digit.` · `"<skill>" is longer than 50 characters.` · `24 skills entered; search takes at most 20.`
— `contracts/openapi.yaml, runSearch 400 examples, verbatim`

"Letter or digit" is Unicode (`\p{L}` / `\p{N}`), matching the matcher's Unicode boundaries (sad §4 choice 2).

**Fallback:** [spec.md](../spec.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml). Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (Messages above are surfaced by T9.)

## Acceptance criteria

### AC-05 — error

> **Given** the owner enters a skill with no letter or digit (for example "#" or "--"), a skill longer than 50 characters, or more than 20 skills
> **When** the owner searches
> **Then** the search does not run, the message under the skills field names the skill (or the count) and the rule it breaks, and the list on screen stays as it was
>
> > Skills are separated by commas; spaces inside a skill are kept ("machine learning"); surrounding spaces and empty entries are ignored; the same skill entered twice in different letter case counts once.
>
> — `spec.md §5, AC-05 + note, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `parseSkills(text): { ok: true, skills: string[] } | { ok: false, message: string }` in `search/domain/skills.ts`.
- [ ] Count limit is checked on the deduped list (after dropping empties).
- [ ] `skills.test.ts`: table over every rule and the note's cases.

## Edge cases

| Case | Behaviour |
|---|---|
| `""` or `" , , "` | ok, `[]` (the feed, AC-10) |
| `"React, react , REACT"` | ok, `["React"]` |
| `" machine learning "` | ok, `["machine learning"]` |
| `"C#, C++, .NET"` | ok — each has a letter |
| `"#"` / `"--"` | refused, message names the skill |
| 51-char skill | refused, names the skill |
| 21 distinct skills | refused, names the count |
| 21 entries, 20 after dedupe | ok |

## Definition of Done

- [ ] unit tests for every Edge-cases row pass
- [ ] no I/O in `skills.ts`
- [ ] lint + vet clean
