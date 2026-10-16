---
id: T10
title: "Assess at snapshot build, order by penalty, and present realness and realness_on in search"
layer: "app"
deps: ["T04", "T08", "T09"]
blocks: ["T13", "T14"]
acs: ["AC-01", "AC-03", "AC-04", "AC-05", "AC-09"]
files_hint: ["apps/server/src/modules/search/app/search.ts", "apps/server/src/modules/search/app/deps.ts", "apps/server/src/modules/search/app/pages.ts", "apps/server/src/modules/search/app/present.ts", "apps/server/src/modules/search/app/snapshots.ts", "apps/server/src/app.ts", "apps/server/test/search-realness.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Assess at snapshot build, order by penalty, and present realness and realness_on in search

## Place in the sequence

- **Blocked by:** T04 — Let search's bestMatchOrder take a realness penalty, T08 — Implement assess(): work out penalty and signals for a set of postings with switch-on rules, T09 — Keep realness with every mark and once a day: mark records, daily share, tracking's onMarkChanged hook · **Blocks:** T13 — Prove no loss, unchanged speed, zero cost and refused outsiders end to end, T14 — Write the amended match-score AC-11 and collector AC-11 into their specs · **Wave:** 5.
- **Lane:** shares `apps/server/src/app.ts` with T07 — serialized; shares `apps/server/src/app.ts` with T09 — serialized.

## Why (user story)

> **As a** owner
> **I want** postings with realness signals to sit lower in the best-match order than postings with a similar fit and no signals
> **So that** I spend my applications on roles that are still being filled
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task is where the owner sees it: live roles rise in best match first, every lowered card carries its signals, and nothing else about the list moves.

## Inlined context

> **Chosen:** option 1. A corrected amount rule applies at the next load with no backfill and no rule-version recompute, listings collected before shipping are judged from their text at once, and search already pays a similar per-build text scan for skills. Penalties and signals are fixed in the snapshot, so paging never reshuffles.
>
> — `adr/0002, Decision outcome, verbatim` · full text: [0002-work-out-realness-signals-when-search-builds-a-snapshot.md](../adr/0002-work-out-realness-signals-when-search-builds-a-snapshot.md)

> **Chosen:** option 1. It meets AC-05 as written and makes realness useful from the first day, at the cost of amending match-score AC-11 (wording in SAD §4).
>
> — `adr/0003, Decision outcome, verbatim` · full text: [0003-offer-best-match-first-without-a-profile-and-treat-unreadable-scores-as-unscored.md](../adr/0003-offer-best-match-first-without-a-profile-and-treat-unreadable-scores-as-unscored.md)

> Assumed: search assesses every shown posting at snapshot build in both orders and keeps the result in the snapshot — because the newest-first line, the daily share and stable paging all need it. `assess` always uses switch-on rules; search alone applies `isOn()` to the order and to the cards (critic F1), so the daily share and mark records never depend on the switch.
>
> — `sad.md §4, Assumptions ledger, verbatim` · full text: [sad.md](../sad.md)

> | Failure policy | Realness fails open for the list: if realness facts or the switch cannot be read, search builds the list with penalty 0 and no reason lines and logs a warning, as it does for unreadable scores. Mark records and the daily share are best-effort and never fail a mark or a list | here, search `readScores` precedent |
>
> — `sad.md §8, Failure policy row, verbatim` · full text: [sad.md](../sad.md)

> Search->>Realness: assess the shown postings now → penalty and signals per posting, by switch-on rules
> Search->>Realness: note the day's share from these switch-on values
> Search->>Realness: is realness on → on
> Search->>Search: order by score minus penalty, unscored block by penalty
> Search-->>Web: first 50 with match and realness per card
> alt scores cannot be read or no profile: every posting is unscored, ordered by penalty
> alt realness off: order ignores the penalty, no realness on cards, share still kept
>
> — `sad.md §6, Flow 1, abridged` · full text: [sad.md](../sad.md)

> Search's existing structured log line gains `lowered` (postings with a penalty in this build) and `realnessMs` (assessment time), so a slowdown shows next to `durationMs`.
>
> — `sad.md §7, Monitoring, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. (Penalties and signals live in search's in-memory snapshot — data-model §Not stored.)

## API contract

- `POST /api/v1/search/snapshots` (`runSearch`) and `POST /api/v1/search/snapshots/{snapshot_id}/pages` (`getNextPage`): `SearchResult` gains `realness_on: boolean`; every `Posting` gains `realness: Realness | null` — `{penalty 1–30, signals[1..3]}` when realness is on and the posting has ≥ 1 signal, else `null`. `match`, `total`, `new_count`, `marked_count`, `hidden_count` unchanged by realness. Best match first allowed without a profile and kept when scores are unreadable. Fail-open: penalty 0, `realness_on` as last known (true if never read), `realness: null` everywhere.
- Pages return the realness kept in the snapshot (not recomputed).

— `contracts/openapi.yaml, operationIds runSearch + getNextPage, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** realness is on, the owner's list is in best match first, and it holds posting A with match score 88 and no signals, posting B with match score 92, posted 65 days ago and stating no salary, and posting C with match score 70 and no signals
> **When** the owner opens the list
> **Then** they see A (88), then C (70), then B (92 minus 25 is 67); each card still shows its own match score, A 88, C 70 and B 92; postings with an equal score after the penalty keep their newest-first order
>
> > Penalty points: posted or first found 30–59 days ago 10; 60 or more days ago 20; open at three or more enabled sources and first found 45 or more days ago 15 (the larger of this and age counts, not both); reposted 10; no stated salary 5. The total is capped at 30. "N days ago" counts calendar days in the owner's time zone between the time and today, for both the thresholds and the number on the card.
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — domain invariant

> **Given** realness is on and some postings in the owner's list carry realness signals
> **When** the owner looks at the list in either order, with or without a profile, and with the remote filter on or off
> **Then** the list holds exactly the postings it would hold with realness off, every count (the list total, the hidden count, the marked count) is the same, every card shows the same match score and fit note as with realness off, and no posting's penalty is above 30 points
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** realness is on and the owner's list is newest first
> **When** the owner opens the list or asks for more
> **Then** the postings are in exactly the newest-first order search gives them, with or without signals; postings with signals show them as "Signals: …", never as "Lowered" (AC-02)
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — happy

> **Given** realness is on, the owner's list is in best match first, and 12 postings have no match score (pending, cap reached, could not be scored, or no profile yet): 8 with no signal and 4 with signals
> **When** the owner opens the list
> **Then** the postings without a score still come before every scored posting (match-score AC-11), and within that block the 8 come first, newest first, then the 4 from the smallest penalty to the largest, equal penalties newest first; this holds when no profile exists and when scoring has a problem
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — cross-context

> **Given** a posting is open at four sources and was first found 50 days ago, and one of those sources is then disabled by the owner
> **When** the owner next loads the list
> **Then** only listings still offered by enabled sources count toward "on N boards", so it reads "on 3 boards · first found 50 days ago" and keeps that signal; with two enabled sources left it has only the age signal; a change the collector makes to a posting (a new listing, a reopening, new text stating pay) changes its signals from the next time the list is loaded or refreshed
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Remove the newest-first fallback when scores are unreadable or there is no profile (`order` stays `best_match`; every posting unscored) — `search/app/search.ts` (today: `wanted === "best_match" && scores.matches ? …`)
- [ ] After the shown set is fixed: `assess` every shown posting (both orders); `noteListShown` for the owner's list; read `isOn()`; wrap in try/catch → fail-open + warn — `search/app/search.ts`, imports `realness/app` per ADR-0001
- [ ] Best match: `bestMatchOrder(newestIds, scoreOf, on ? penaltyOf : undefined)` (T04); newest first untouched
- [ ] Keep `{penalty, signals}` and `realness_on` in the snapshot; present `realness` (null when off / no signal) and `realness_on` — `search/app/snapshots.ts`, `present.ts`, `pages.ts`
- [ ] Add `lowered` and `realnessMs` to the build log line
- [ ] Integration test with the contract helper — `apps/server/test/search-realness.integration.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Realness off | best match by score alone, `realness: null` on every card, share still noted |
| No profile, best match | `order: best_match`, all unscored, ordered by penalty |
| Scores unreadable | stays best match (no newest fallback), all unscored |
| assess / switch read throws | list built with penalty 0, `realness: null`, warning logged |
| Source disabled between two loads | next load shows the new board count (AC-09) |
| Asking for more | next page carries the snapshot's kept realness; no repeat or skip |
| Marked view | unchanged — no `realness` on marked cards |

## Definition of Done

- [ ] AC-01 / AC-04 / AC-05 / AC-09 asserted end to end through the routes
- [ ] existing `search-*.integration.test.ts` suites stay green (update only the asserted newest-fallback case, citing ADR-0003)
- [ ] every response validates against `realness-score` contract
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
