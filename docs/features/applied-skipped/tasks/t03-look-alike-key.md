---
id: T03
title: "Write the look-alike key and winning-mark rule, on the collector's exported merge normalization"
layer: "domain"
deps: []
blocks: ["T09"]
acs: ["AC-10", "AC-11"]
files_hint: ["apps/server/src/modules/tracking/domain/look-alike.ts", "apps/server/src/modules/tracking/domain/look-alike.test.ts", "apps/server/src/modules/collector/domain/merge.ts", "apps/server/src/modules/collector/app/match-keys.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T03 — Write the look-alike key and winning-mark rule, on the collector's exported merge normalization

## Place in the sequence

- **Blocked by:** — · **Blocks:** T09 — Implement tracking's read queries for search: marked ids, the marked order, and look-alike hints · **Wave:** 1 (no deps, starts at once).
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** a posting that looks like one I already marked to say so
> **So that** I don't apply twice to the same role
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

The pure rule that decides which marked posting a new one looks like, and which mark the hint names.

## Inlined context

> **Decision:** For each page, tracking builds a map from a look-alike key to the winning mark (an applied mark if any, else the most recent skip) over the current marks, closed postings included and cleared ones excluded. The key is the collector's merge normalization plus tracking's extra title rules (non-region brackets dropped, Sr/Jr read as Senior/Junior).
>
> — `sad.md §4, choice 4 (ADR-0004), abridged` · full text: [ADR-0004](../adr/0004-find-look-alikes-on-read-with-the-collectors-merge-normalization.md)

> `match-keys.ts` — NEW read-only re-export of normalizeCompany / normalizeTitle (collector/domain/merge.ts)
>
> — `sad.md §5, Internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> **Code fact (2026-10-07):** `normalizeTitle` and `normalizeCompany` in `apps/server/src/modules/collector/domain/merge.ts` are module-private; only `matchKey(company, title)` is exported. This task adds `export` to both and re-exports them from `collector/app/match-keys.ts`.
>
> — `apps/server/src/modules/collector/domain/merge.ts:57-77, abridged`

> **Hard rule:** Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`. A module reaches another only through that module's `app/` exports.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

> **Open detail:** no upstream artifact lists the "region names" a bracket may hold. Keep a small named constant in `look-alike.ts` (the regions the sources already use, e.g. Europe, EMEA, Americas, LATAM, APAC, Worldwide, US, UK, EU), mark it with a `ponytail:` comment, and raise it in review. It is tuned with spec §8's look-alike question (due 2026-10-31).
>
> — `spec.md §8, open question 1, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-10 — happy

> **Given** the owner marked a posting at "Acme Inc" titled "Sr. Backend Engineer (Go) – Remote" applied on 3 October, and 8 days after its latest publication time the collector adds a separate open posting from "ACME" titled "Senior Backend Engineer"
> **When** the new posting is shown in the owner's list
> **Then** it carries the hint "You applied to a similar posting at Acme on 3 Oct", and the hint names the earlier mark (applied or skipped) and the date it was set. Two postings are similar when their company and title match the way the collector matches them when merging (collector AC-04 note: letter case, punctuation, generic "remote" wording and legal suffixes ignored) and, beyond that, any bracketed part of the title other than a region name is ignored and "Sr" is read as "Senior" and "Jr" as "Junior". Publication times and location restrictions are not compared. When several marked postings match, the hint names an applied one if there is one, otherwise the most recently set skipped mark. Any marked posting job-radar still holds can be the match, closed ones included; a posting whose mark was cleared is unmarked and gives no hint.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — domain invariant

> **Given** a look-alike posting carries a hint about a marked one
> **When** the owner's list is built
> **Then** the look-alike is never hidden and never inherits the mark; it stays in the list and counts until the owner marks it; and a posting from the same company with a different title carries no hint
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Export `normalizeTitle` / `normalizeCompany` from `collector/domain/merge.ts` (no behaviour change)
- [ ] Add `collector/app/match-keys.ts` re-exporting both (the app-layer door other modules use)
- [ ] `tracking/domain/look-alike.ts`: `lookAlikeKey(company, title)` (collector normalization, then non-region brackets dropped, Sr→Senior, Jr→Junior) and `winningMark(marks)` (applied wins, else the newest skip; cleared never)
- [ ] `look-alike.test.ts`: the AC-10 example table + edge cases below

## Edge cases

| Case | Behaviour |
|---|---|
| Same company, different title | No key match, no hint (AC-11) |
| Bracket holds a region, e.g. "(Europe)" | Kept in the key |
| Several marked matches: two skips and one applied | The applied one is named |
| Several skips only | The most recently set skip is named |
| Matching posting's mark was cleared | Not a match (gives no hint) |
| Publication times or location restrictions differ | Not compared; still a match |

## Definition of Done

**Done when:** look-alike.test.ts passes over the AC-10 example table (Acme Inc / ACME, 'Sr. Backend Engineer (Go) – Remote' / 'Senior Backend Engineer'), the same-company-different-title case, and the winning-mark order; collector merge tests still pass.

- [ ] `look-alike.test.ts` passes, including the exact AC-10 pair
- [ ] existing `collector/domain/merge.test.ts` still passes
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
