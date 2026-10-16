---
id: T06
title: "Export the realness facts from collector/app: reopening, pay fields, closed heads, pay-field boards"
layer: "app"
deps: ["T01"]
blocks: ["T08"]
acs: ["AC-08", "AC-09"]
files_hint: ["apps/server/src/modules/collector/infra/repo/open-postings.ts", "apps/server/src/modules/collector/app/open-postings.ts", "apps/server/src/modules/collector/app/realness-facts.ts", "apps/server/test/helpers/search-fixtures.ts", "apps/server/test/collector-read-exports.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T06 — Export the realness facts from collector/app: reopening, pay fields, closed heads, pay-field boards

## Place in the sequence

- **Blocked by:** T01 — Promote the staged schema: pay_field, reopened_at and the three realness tables · **Blocks:** T08 — Implement assess(): work out penalty and signals for a set of postings with switch-on rules · **Wave:** 2.
- **Lane:** shares `apps/server/test/helpers/search-fixtures.ts` with T13 — serialized.

## Why (user story)

> **As a** owner
> **I want** postings with realness signals to sit lower in the best-match order than postings with a similar fit and no signals
> **So that** I spend my applications on roles that are still being filled
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Realness may only reach the collector through `collector/app`; this task gives it the facts the signal rules need, read-only.

## Inlined context

> Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`; a module reaches another only through its `app/` exports.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

> - Assumed: a new collector export of closed postings' heads (`id`, `company`, `title`, `publishedAt`, `firstFoundAt`) for the repost rule — because removed postings must not count, and only the collector knows what still exists.
> - Assumed: boards are counted from `enabledSourceIds` — because the remote filter already counts only enabled sources that way.
>
> — `sad.md §4, Assumptions ledger, verbatim` · full text: [sad.md](../sad.md)

> | *(none new)* | `collector_postings` | — | The repost rule reads closed postings' heads once per snapshot build (`status = 'closed'`) and computes look-alike keys in memory. It's a bounded table scan, because clean-up removes closed postings [...] Revisit if the search NFR test shows this read in its profile. |
>
> — `data-model.md §Indexes, collector_postings row, abridged` · full text: [data-model.md](../data-model.md)

> Mapping: Himalayas `minSalary`/`maxSalary` + `salaryPeriod`; Remotive `salary`; Jobicy `salaryMin`/`salaryMax` + `salaryCurrency`. [...] `""` = the board states nothing or has no pay field (We Work Remotely).
>
> — `data-model.md §collector_listings.pay_field, abridged` · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Read-only: `collector_postings.reopened_at`, `collector_listings.pay_field` (added by T01), `collector_postings` heads where `status = 'closed'`.

— `data-model.md §Entities, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-08 — cross-context

> **Given** the collector reopened a posting after it had closed (a reopening since this shipped), or the owner's collection holds an earlier, closed posting (marked or not) that matches this posting by the look-alike matching rule (company and title as in CONTEXT "Look-alike posting", applied here to any earlier posting, not only a marked one), whose time as search orders it (publication time, never later than first found) is more than 7 days before this posting's
> **When** job-radar works out the posting's realness signals
> **Then** it has the repost signal; a posting merged from listings within 7 days of each other (collector AC-04) is one posting and is not a repost; two copies collected on the same day in the first fill, published more than 7 days apart, are a repost; a posting whose earlier copy was already removed by clean-up has no repost signal; while the earlier matching posting is still open, the two are read as parallel hires and neither has the repost signal; a look-alike posting keeps its look-alike hint (applied-skipped) next to the reason line
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — cross-context

> **Given** a posting is open at four sources and was first found 50 days ago, and one of those sources is then disabled by the owner
> **When** the owner next loads the list
> **Then** only listings still offered by enabled sources count toward "on N boards", so it reads "on 3 boards · first found 50 days ago" and keeps that signal; with two enabled sources left it has only the age signal; a change the collector makes to a posting (a new listing, a reopening, new text stating pay) changes its signals from the next time the list is loaded or refreshed
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `reopenedAt: number | null` to `OpenPosting` and `payField: string | null` to `OpenListing`, selected in `read()` — `collector/infra/repo/open-postings.ts`; re-export stays in `collector/app/open-postings.ts`
- [ ] Update any `OpenPosting` literal builders so tests compile — `apps/server/test/helpers/search-fixtures.ts`
- [ ] New `collector/app/realness-facts.ts`: `closedPostingHeads(db)` → `{id, company, title, publishedAt, firstFoundAt}[]` for closed postings; `hasPayField(sourceId)` — himalayas, remotive, jobicy `true`; weworkremotely `false`
- [ ] `matchKey` on `OpenPosting` (sad ledger) is not added: no rule reads it (repost keys on `lookAlikeKey`). Add it only if T08 turns out to need it
- [ ] Extend `apps/server/test/collector-read-exports.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Posting removed by clean-up | absent from `closedPostingHeads` (so it cannot cause a repost, AC-08) |
| Closed listing on an open posting | keeps `payField`, but realness only counts open listings |
| Unknown source id | `hasPayField` → `false` |

## Definition of Done

- [ ] read-exports test covers the three new reads
- [ ] no module outside collector imports `collector/infra`
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
