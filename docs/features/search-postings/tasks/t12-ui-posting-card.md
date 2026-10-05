---
id: T12
title: "Build PostingCard (matched skills, time, per-source links) and the Badge `new` tone"
layer: "ui"
deps: []
blocks: ["T13"]
acs: ["AC-06", "AC-07", "AC-08", "AC-09"]
files_hint: ["apps/web/src/features/search/PostingCard.tsx", "apps/web/src/features/search/PostingCard.test.tsx", "apps/web/src/components/Badge.tsx"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
# measured inlined lines: 52
status: "todo"
---

<!-- Self-contained task: inlined slices carry provenance signatures; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Build PostingCard (matched skills, time, per-source links) and the Badge `new` tone

## Place in the sequence

- **Blocked by:** — (renders the contract's `Posting`) · **Blocks:** T13 — Compose SCR-01 · **Wave:** 1.
- **Lane:** own lane; parallel with T11. Only task that edits `components/Badge.tsx`.

## Why (user story)

> **As an** owner
> **I want** each posting to show its title, company, publication time and location restriction, and to name and link every source that lists it
> **So that** I can check where I may work from and apply on the board I prefer
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

One posting on screen, safe against hostile source text and links. Security review is scoped here (spec §6.1).

## Inlined context

| Part | Rule | Source |
|---|---|---|
| Title, company | Plain text only. Title is `font-medium`, company is `text-text-muted` | AC-07, AC-09 |
| New mark | Badge (tone `new`, extended) "New" when `is_new` | AC-14 |
| Time | "Published 2 d ago", using `<time datetime>` with the absolute UTC date in `title`. When `published_at` is null: "Publication time unknown · first seen 3 Oct" | AC-03, AC-07 |
| Matched skills | One Badge (tone `notice`) per `matched_skills` entry, in the owner's spelling and search order. An in-title match reads "React · title"; no chips in the feed. The chips are never highlighted inside the title | AC-06, AC-10, sad.md §8 |
| Sources | One row per listing: the source name (`SOURCE_NAMES`, falling back to the raw `source_id`) followed by " — " and the location restriction, or "unknown" when it's null. The name renders in one of three ways: (a) open listing with a `url`: an `<a target="_blank" rel="noopener noreferrer">` with a 44 px tall target; (b) `status: closed`: plain name plus "closed at <Source>" in `text-text-muted`, no link; (c) open listing with `url: null`: plain name, no link | AC-07, AC-08, AC-09 |

> The whole card is not a link; only the source names are. Every action target is at least 44×44 px, and there is no horizontal scroll at 360 px (spec §6). · Badge — Tone `new` (`bg-accent text-accent-contrast`) — Existing tokens only, so no new token is needed
>
> — `screens.md §SCR-01, NEW: PostingCard + Extended primitives, abridged` · full text: [screens.md](../screens.md)

> the web renders them as React text only (no `dangerouslySetInnerHTML`); matched skills are shown as Badge chips, not highlighted inside source text
>
> — `sad.md §8, Untrusted source content, abridged`

Reuse: `components/Badge.tsx`, `SOURCE_NAMES` from `api/collector.ts`, `lib/time.ts` for relative time. `SOURCE_NAMES` may lack a new source (roadmap step 11) — fall back to `source_id`.

**Fallback:** [screens.md](../screens.md) · [sad.md](../sad.md) · `docs/design-system.md`. Do not guess.

## Data delta

No DB changes.

## API contract

Renders `Posting { id, title, company, published_at|null, first_seen_at, is_new, matched_skills[{skill, in_title}], listings[{source_id, status: open|closed, url|null, location_restriction|null}] }`. `url` is already `null` for closed or non-http(s) listings (server check, T7) — the card still never builds a link from anything but `url`.

— `contracts/openapi.yaml, schemas Posting/Listing/MatchedSkill, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-06 — happy

> **Given** a posting mentions "React" in its title and "TypeScript" only in its description, and the owner searched "React, TypeScript, Go"
> **When** the posting is shown in the list
> **Then** it shows "React" and "TypeScript" as matched — React marked as found in the title — in the owner's own spelling, and does not show "Go"; on a merged posting a skill counts as found in the title when any open listing's title has it
>
> — `spec.md §5, AC-06, verbatim`

### AC-07 — happy

> **Given** an open posting in the list
> **When** the owner looks at it
> **Then** they see its title, company, publication time (or "publication time unknown" with when it was first seen), its location restriction exactly as each source stated it ("unknown" when a source stated nothing), and the name of every source that lists it, each open listing opening that source's own page for the posting (closed listings per AC-08)
>
> — `spec.md §5, AC-07, verbatim`

### AC-08 — domain invariant

> **Given** a posting listed by Jobicy and Himalayas, where Himalayas has confirmed its listing closed but Jobicy still offers it
> **When** the posting is shown
> **Then** the source of every listing is named — Jobicy with its link, Himalayas marked "closed at Himalayas" without a link — so the source of any text shown is always credited (board terms require attribution), and the posting is never shown without at least one linked open source
>
> — `spec.md §5, AC-08, verbatim`

### AC-09 — domain invariant

> **Given** a source's listing carries markup or script in its title or description, or a link that is not an ordinary web address
> **When** the posting is shown, including where matched skills are marked
> **Then** the text is shown as plain text and never acts as markup, and the source is still named but its link is not clickable
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `components/Badge.tsx`: add tone `new` (additive; existing call sites unchanged).
- [ ] `features/search/PostingCard.tsx` per the parts table.
- [ ] `PostingCard.test.tsx`: contract example posting; hostile title `<img src=x onerror=…>` renders as text and creates no element; closed + `url: null` variants have no `<a>`; 360 px no horizontal overflow.

## Edge cases

| Case | Behaviour |
|---|---|
| `published_at: null` | "Publication time unknown · first seen <date>" |
| `location_restriction: null` | "unknown" |
| Unknown `source_id` | raw id shown as name |
| `matched_skills: []` | no chips |
| Long title / company | wraps, no horizontal scroll at 360 px |

## Definition of Done

- [ ] component tests for AC-06, AC-07, AC-08, AC-09 pass
- [ ] no `dangerouslySetInnerHTML`; every `<a>` has `target="_blank" rel="noopener noreferrer"`
- [ ] lint + vet clean
