---
id: T11
title: "Show the reason line on posting cards (ReasonLine + api types)"
layer: "ui"
deps: []
blocks: ["T12"]
acs: ["AC-02", "AC-04"]
files_hint: ["apps/web/src/api/search.ts", "apps/web/src/features/realness/ReasonLine.tsx", "apps/web/src/features/realness/ReasonLine.test.tsx", "apps/web/src/features/search/PostingCard.tsx", "apps/web/src/features/search/PostingCard.test.tsx", "apps/web/src/features/search/SearchList.tsx", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Show the reason line on posting cards (ReasonLine + api types)

## Place in the sequence

- **Blocked by:** nothing — can start at once · **Blocks:** T12 — Add the realness switch to the main screen and offer best match first without a profile · **Wave:** 1.
- **Lane:** shares `docs/design-system.md` with T12 — serialized.

## Why (user story)

> **As a** owner
> **I want** each lowered posting to name every signal behind its penalty
> **So that** I can check the reason on the board and decide for myself
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task puts the reasons in front of the owner in words they can check on the board in a few seconds.

## Inlined context

> | Untrusted text | Posting text is only searched for amounts; the reason line is built in the web from fixed phrases and numbers job-radar works out, never from posting text (spec §6.1) | here |
>
> — `sad.md §8, Untrusted text row, verbatim` · full text: [sad.md](../sad.md)

> | default — best match, lowered | `order: best_match`, `realness_on: true`; a card with `realness` (AC-01, AC-02) | RealnessSwitch (NEW) beside OrderSwitch; PostingCard + MatchSummary (score unchanged) + ReasonLine (NEW) "Lowered: …" | wireframe A |
> | newest first, signals | `order: newest`, `realness_on: true` (AC-02, AC-04) | PostingCard + ReasonLine "Signals: …"; order exactly as search gives it | wireframe B |
> | card with no signal | `realness: null` (AC-02) | PostingCard as today; no ReasonLine | wireframe A (card 1) |
> | look-alike + reason | A reposted posting that is also a look-alike (AC-08) | PostingCard look-alike line as today, plus ReasonLine with "reposted" | wireframe B (card 2) |
> | marked view | "Show marked postings" on | RealnessSwitch hidden, as OrderSwitch is; marked cards carry no ReasonLine | — (unchanged marked view) |
>
> — `screens.md, SCR-01 states (ReasonLine rows), verbatim` · full text: [screens.md](../screens.md)

> - Prefix "Lowered: " in best match first, "Signals: " in newest first. Phrases joined with " · ", in the order the API sends them.
> - `age` → "posted N days ago" (`basis: posted`) or "first found N days ago" (`basis: first_found`).
> - `many_boards` → "on N boards · first found N days ago".
> - `repost` → "reposted".
> - `no_salary` → "no salary listed".
> - `text-sm text-text-muted`. It wraps at 360 px; no truncation, no horizontal scroll.
>
> — `screens.md, Reason line wording, verbatim` · full text: [screens.md](../screens.md)

> | ReasonLine (`apps/web/src/features/realness/ReasonLine.tsx`) | Badge is a short status label, and LocationCheck shows one fixed reason. The reason line is a sentence assembled from several signals, with an order-dependent prefix | pending |
>
> — `screens.md, New components, verbatim` · full text: [screens.md](../screens.md)

> RealnessSignal (oneOf):
>   age:          { kind: "age", basis: "posted" | "first_found", days: integer ≥ 30 }
>   many_boards:  { kind: "many_boards", boards: integer ≥ 3, days: integer ≥ 45 }   # days since first found
>   repost:       { kind: "repost" }
>   no_salary:    { kind: "no_salary" }
> Realness: { penalty: integer 1–30, signals: RealnessSignal[1..3] }
>   signals order: age or many boards, repost, no salary (AC-02)
>
> — `contracts/openapi.yaml, components.schemas RealnessSignal + Realness, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Consumes `runSearch` / `getNextPage`: `SearchResult.realness_on: boolean`; `Posting.realness: { penalty, signals: RealnessSignal[] } | null` (shape inlined above).

— `contracts/openapi.yaml, schemas SearchResult + Posting.realness, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-02 — happy

> **Given** realness is on and a posting in the owner's list was reposted, states no salary and was first found 47 days ago, with no publication time from its sources
> **When** the owner sees its card, in either order
> **Then** the card shows one line naming every signal behind the penalty, for example "Lowered: first found 47 days ago · reposted · no salary listed" in best match first, and the same signals as "Signals: …" in newest first, where nothing was lowered; an age says "posted N days ago" only when the time it counts from is the publication time (AC-07), and "first found N days ago" otherwise, including when a source gives a publication time later than when job-radar first found the posting; a long life on many boards says "on 4 boards · first found 50 days ago"; when both time signals apply, the line names only the one that counts (AC-01); a posting with no signal shows no line
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** realness is on and the owner's list is newest first
> **When** the owner opens the list or asks for more
> **Then** the postings are in exactly the newest-first order search gives them, with or without signals; postings with signals show them as "Signals: …", never as "Lowered" (AC-02)
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `Realness`, `RealnessSignal` types, `Posting.realness`, `SearchResult.realness_on` — `apps/web/src/api/search.ts`
- [ ] `ReasonLine({ realness, order })` builds the sentence only from `kind` / `basis` / `days` / `boards`; renders nothing for null — `features/realness/ReasonLine.tsx` (tokens `text-sm text-text-muted`, no new styling)
- [ ] Add the reason slot under the match slot in `PostingCard`, passing the list `order` from `SearchList`; not in the marked view — `features/search/PostingCard.tsx`, `SearchList.tsx`
- [ ] Tests per signal kind, both prefixes, null, look-alike + reposted together — `ReasonLine.test.tsx`, `PostingCard.test.tsx`
- [ ] Register ReasonLine and the PostingCard reason slot — `docs/design-system.md`

## Edge cases

| Case | Behaviour |
|---|---|
| `realness: null` | no line |
| Best match vs newest first | "Lowered: " vs "Signals: " with the same phrases |
| `many_boards` boards 4, days 50 | "on 4 boards · first found 50 days ago" |
| Look-alike posting that is reposted | look-alike line as today plus "reposted" in the reason line |
| 360 px wide | line wraps, no truncation, no horizontal scroll |

## Definition of Done

- [ ] component tests pass for every SCR-01 ReasonLine state listed above
- [ ] no posting text reaches the line (test renders a posting whose title contains a phrase and asserts the line is unchanged)
- [ ] ReasonLine registered in `docs/design-system.md`
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test` (unit + integration) green and `pnpm lint` (biome) clean
