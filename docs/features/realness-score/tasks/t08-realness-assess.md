---
id: T08
title: "Implement assess(): work out penalty and signals for a set of postings with switch-on rules"
layer: "app"
deps: ["T02", "T03", "T06", "T07"]
blocks: ["T09", "T10"]
acs: ["AC-06", "AC-07", "AC-08", "AC-09"]
files_hint: ["apps/server/src/modules/realness/app/assess.ts", "apps/server/src/modules/realness/app/deps.ts", "apps/server/src/modules/tracking/app/look-alike.ts", "apps/server/test/realness-assess.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T08 — Implement assess(): work out penalty and signals for a set of postings with switch-on rules

## Place in the sequence

- **Blocked by:** T02 — Write the amount parser and its labelled salary set, T03 — Write the signal and penalty rules: age basis, many boards, repost, no salary, cap 30, T06 — Export the realness facts from collector/app: reopening, pay fields, closed heads, pay-field boards, T07 — Add the realness module with its switch: settings repo, GET/POST /api/v1/realness/settings, registration · **Blocks:** T09 — Keep realness with every mark and once a day: mark records, daily share, tracking's onMarkChanged hook, T10 — Assess at snapshot build, order by penalty, and present realness and realness_on in search · **Wave:** 3.
- **Lane:** shares `apps/server/src/modules/realness/app/deps.ts` with T07 — serialized.

## Why (user story)

> **As a** owner
> **I want** postings with realness signals to sit lower in the best-match order than postings with a similar fit and no signals
> **So that** I spend my applications on roles that are still being filled
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task joins the stored facts to the rules: it is the one call search, mark records and the daily share all use, so the three always agree.

## Inlined context

> **Chosen:** option 1. A corrected amount rule applies at the next load with no backfill and no rule-version recompute, listings collected before shipping are judged from their text at once, and search already pays a similar per-build text scan for skills. Penalties and signals are fixed in the snapshot, so paging never reshuffles.
>
> — `adr/0002, Decision outcome, verbatim` · full text: [0002-work-out-realness-signals-when-search-builds-a-snapshot.md](../adr/0002-work-out-realness-signals-when-search-builds-a-snapshot.md)

> **Signal definitions (spec AC-06 – AC-09):**
> - *Age basis* — "posted" when `publishedAt` is set and not later than `firstFoundAt`; otherwise "first found" (first fill without a publication time, or a publication time later than first found).
> - *Many boards* — distinct **enabled** sources (`collector/app/location.ts` `enabledSourceIds`) with an open listing for the posting.
> - *Repost* — the posting has `reopenedAt` (a reopening since this shipped); or a **closed**, not-removed earlier posting has the same `lookAlikeKey(company, title)` and an effective time more than 7 days before this one's. An earlier match that is still open means parallel hires: neither gets the signal.
> - *No salary* — none of the posting's open listings from enabled sources states pay. A listing states pay when its pay field or its title or description holds an amount of money as pay (the amount parser). It also counts as stating pay when its pay field is NULL (not read since this shipped) and its source has a pay field.
>
> — `sad.md §4, Signal definitions, verbatim` · full text: [sad.md](../sad.md)

> Assumed: search assesses every shown posting at snapshot build in both orders and keeps the result in the snapshot — because the newest-first line, the daily share and stable paging all need it. `assess` always uses switch-on rules; search alone applies `isOn()` to the order and to the cards (critic F1), so the daily share and mark records never depend on the switch.
>
> — `sad.md §4, Assumptions ledger, verbatim` · full text: [sad.md](../sad.md)

> | Cost | Realness calls no provider and adds nothing to the scoring cap (AC-13) | here |
>
> — `sad.md §8, Cost row, verbatim` · full text: [sad.md](../sad.md)

> Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`; a module reaches another only through its `app/` exports.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

> Realness reads postings, listings, closed-posting heads, enabled sources and pay-field capability through `collector/app`, and the look-alike key through `tracking/app`.
>
> — `sad.md §5, Building block view, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Reads only (through `collector/app`): `collector_postings.reopened_at`, `collector_listings.pay_field`, closed posting heads, enabled sources. No writes.

— `data-model.md §Not stored, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 — domain invariant

> **Given** a posting states its pay — any of its open listings from an enabled source has an amount in its board's own pay field, or the title or description of any of those listings gives an amount of money as pay, such as "$120k", "120–150K USD", "PLN 20 000–25 000 net B2B", "18 000 zł/mies.", "€60,000 a year" or "30k/month"
> **When** job-radar works out its realness signals
> **Then** the posting has no "no salary" signal; wording without an amount ("competitive", "DOE", "attractive package", "market rate") counts as no stated salary, and amounts that are not pay ("$5M Series A", "$2,000 learning budget", "$1B ARR") are never read as a salary; a listing whose pay state is unknown (collected before this shipped and not fetched since, §1) on a board that has a pay field counts as stating pay until its next fetch
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a posting whose age is worked out from its time as search orders it — its publication time, but never later than when job-radar first found it — including postings collected in the collector's first fill
> **When** that time is 30 days ago or more
> **Then** it has the age signal; a posting collected in the first fill with no publication time counts from when it was first found and its reason says "first found N days ago", never "posted"; so does a posting whose publication time is later than when it was first found; a posting reopened by the collector keeps the time search orders it by, and also has the repost signal (AC-08)
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

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

- [ ] Export `lookAlikeKey` from tracking's app layer (re-export of `tracking/domain/look-alike.ts`) — `apps/server/src/modules/tracking/app/look-alike.ts`
- [ ] `assess(deps, postings: OpenPosting[], now)` → `Map<id, {penalty, signals}>`: one read each of `enabledSourceIds`, `closedPostingHeads` and open postings' heads (for the parallel-hire check); key all by `lookAlikeKey` in memory — `realness/app/assess.ts`
- [ ] Per posting: enabled open boards; `noSalary` = no open enabled listing where `statesPay(payField)` or `statesPay(title)`/`statesPay(description)` or (`payField === null && hasPayField(source)`); `reopened = reopenedAt !== null`; then `realnessOf` (T03)
- [ ] Never read the switch here; never import a provider client
- [ ] Integration test over a temp DB with the collector fixtures — `apps/server/test/realness-assess.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Pay stated only on a disabled source's listing | does not count — `no_salary` stays |
| `pay_field` NULL on Jobicy (has field) vs NULL on We Work Remotely | stating pay vs not |
| Description says "$5M Series A" only | `no_salary` |
| Source disabled: 4 → 3 enabled boards, first found 50 days | "on 3 boards" kept; at 2 boards only the age signal |
| Earlier closed look-alike already removed by clean-up | no repost |
| Posting merged from listings within 7 days | one posting, no repost |

## Definition of Done

- [ ] every AC-06 – AC-09 branch asserted
- [ ] a spy on the provider client / scoring spend shows zero calls from `assess`
- [ ] realness imports only `collector/app` and `tracking/app` from other modules
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
