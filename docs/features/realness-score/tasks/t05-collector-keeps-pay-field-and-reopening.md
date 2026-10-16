---
id: T05
title: "Keep each board's pay field on every fetch and the reopening time in the collector"
layer: "infra"
deps: ["T01", "T02"]
blocks: ["T14"]
acs: ["AC-06", "AC-08"]
files_hint: ["apps/server/src/modules/collector/domain/adapter.ts", "apps/server/src/modules/collector/infra/sources/himalayas.ts", "apps/server/src/modules/collector/infra/sources/remotive.ts", "apps/server/src/modules/collector/infra/sources/jobicy.ts", "apps/server/src/modules/collector/infra/sources/weworkremotely.ts", "apps/server/src/modules/collector/infra/repo/postings.ts", "apps/server/test/fixtures/sources/", "apps/server/test/collector-realness-facts.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T05 — Keep each board's pay field on every fetch and the reopening time in the collector

## Place in the sequence

- **Blocked by:** T01 — Promote the staged schema: pay_field, reopened_at and the three realness tables, T02 — Write the amount parser and its labelled salary set · **Blocks:** T14 — Write the amended match-score AC-11 and collector AC-11 into their specs · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As a** owner
> **I want** each lowered posting to name every signal behind its penalty
> **So that** I can check the reason on the board and decide for myself
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Without these two stored facts a posting that shows pay on its board would be lowered for "no salary", and a reopened posting could never be told apart from a new one.

## Inlined context

> **Chosen:** option 1. One parser judges every amount, so "competitive" in Remotive's field and "$5M Series A" in a description fall under the same rule and the same fixture set. A rule fix needs no recollection, and the collector keeps statements as stated, as it already does for location.
>
> — `adr/0004, Decision outcome, verbatim` · full text: [0004-keep-each-boards-pay-field-as-text-on-the-listing-and-judge-it-in-realness.md](../adr/0004-keep-each-boards-pay-field-as-text-on-the-listing-and-judge-it-in-realness.md)

> - Himalayas: `minSalary`/`maxSalary` with `salaryPeriod`.
> - Remotive: the free-text `salary` field, often empty, sometimes like "$50-$75 /hour".
> - Jobicy: `salaryMin`/`salaryMax` with `salaryCurrency`, checked against the live v2 API on 2026-10-16 (filled on 12 of 20 jobs). The recorded fixtures predate these fields; `implement` re-records them.
> - We Work Remotely: no pay field.
>
> — `sad.md §4, Resolves spec §8 Q1, abridged` · full text: [sad.md](../sad.md)

> - Assumed: pay field stored as text `collector_listings.pay_field`; `""` when the board states nothing or has no field; NULL = collected before this shipped; per-source `hasPayField` exported by the collector — because the collector keeps facts and realness keeps the interpretation (ADR-0004).
> - Assumed: a pay-field change alone is not an "Updated posting" and does not move source-health counts — because pay is not one of the change fields in CONTEXT "Updated posting".
> - Assumed: `collector_postings.reopened_at` set where the merge decision reopens a posting, and exported on `OpenPosting` along with `matchKey` — because collector AC-11 already decides reopening there.
>
> — `sad.md §4, Assumptions ledger, verbatim` · full text: [sad.md](../sad.md)

> S->>S: map the board's pay data to a pay field, empty when the board states nothing or has no field
> S->>D: write each listing with its pay field, even when nothing else changed
> Note over S,D: persists listing pay field (never NULL after this fetch)
> alt a closed posting is offered again: S->>D: reopen it and keep when it reopened
> alt only the pay field changed: S->>S: not an updated posting, source-health counts unchanged
> alt fetch failed: S->>D: record the source outcome only, no listing or posting change
>
> — `sad.md §6, Flow 4 steps 5–9 + alts, abridged` · full text: [sad.md](../sad.md)

> *remote-boards-collector AC-11*, amended: "A posting that reopens also keeps when it reopened (the latest reopening). A listing keeps its board's own pay field as stated, written on every fetch of the listing, even when nothing else changed. A change in the pay field alone does not make the posting an updated posting." (ADR-0004)
>
> — `sad.md §4, Upstream amendments, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Null | Change |
|---|---|---|---|
| `collector_listings.pay_field` | text | yes | **written** on every fetch: board text as stated, `""` when it states nothing / has no field |
| `collector_postings.reopened_at` | integer | yes | **written** when the merge decision reopens (latest reopening wins) |

— `data-model.md §Posting aggregate, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 — domain invariant

> **Given** a posting states its pay — any of its open listings from an enabled source has an amount in its board's own pay field, or the title or description of any of those listings gives an amount of money as pay, such as "$120k", "120–150K USD", "PLN 20 000–25 000 net B2B", "18 000 zł/mies.", "€60,000 a year" or "30k/month"
> **When** job-radar works out its realness signals
> **Then** the posting has no "no salary" signal; wording without an amount ("competitive", "DOE", "attractive package", "market rate") counts as no stated salary, and amounts that are not pay ("$5M Series A", "$2,000 learning budget", "$1B ARR") are never read as a salary; a listing whose pay state is unknown (collected before this shipped and not fetched since, §1) on a board that has a pay field counts as stating pay until its next fetch
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — cross-context

> **Given** the collector reopened a posting after it had closed (a reopening since this shipped), or the owner's collection holds an earlier, closed posting (marked or not) that matches this posting by the look-alike matching rule (company and title as in CONTEXT "Look-alike posting", applied here to any earlier posting, not only a marked one), whose time as search orders it (publication time, never later than first found) is more than 7 days before this posting's
> **When** job-radar works out the posting's realness signals
> **Then** it has the repost signal; a posting merged from listings within 7 days of each other (collector AC-04) is one posting and is not a repost; two copies collected on the same day in the first fill, published more than 7 days apart, are a repost; a posting whose earlier copy was already removed by clean-up has no repost signal; while the earlier matching posting is still open, the two are read as parallel hires and neither has the repost signal; a look-alike posting keeps its look-alike hint (applied-skipped) next to the reason line
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `payField: string` to `RawListing` and `NormalizedListing`, set by every adapter in the same change (contract stays compiling) — `collector/domain/adapter.ts`
- [ ] Map each board: Himalayas min/max + period, Jobicy min/max + currency → one text a person would read (e.g. `"USD 60000–80000 per year"`); Remotive `salary` as stated; We Work Remotely `""`; missing values → `""` — `collector/infra/sources/*.ts`
- [ ] Write `pay_field` on every listing upsert, outside the change detection that drives `changed`; set `reopened_at = now` where `decision.reopen` is applied — `collector/infra/repo/postings.ts`
- [ ] Re-record the Jobicy fixture with `salaryMin`/`salaryMax`; add a Remotive payload with both an empty and a non-empty `salary` — `apps/server/test/fixtures/sources/`
- [ ] Integration test, incl. asserting `statesPay(payField)` (T02) is true for each structured board's non-empty field — `apps/server/test/collector-realness-facts.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Listing collected before this shipped, not fetched since | `pay_field` stays NULL (unknown) |
| Re-fetch with identical data except pay | `pay_field` updated, posting not counted as updated, health counts unchanged |
| Re-fetch with nothing changed at all | `pay_field` still written (never NULL afterwards) |
| Fetch failed | no listing or posting write (CONTEXT invariant) |
| Posting reopens twice | `reopened_at` = the latest reopening |
| Himalayas with only `minSalary` | field holds that amount; not `""` |

## Definition of Done

- [ ] integration test passes for all four boards plus the reopening
- [ ] existing `collector-*.integration.test.ts` suites stay green (no change in updated/health counts)
- [ ] the Jobicy fixture carries salary fields
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
