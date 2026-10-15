---
id: T11
title: "Add the web remote-filter client, the LocationFilterBar and the CountryChoice on SCR-01"
layer: "ui"
deps: []
blocks: ["T12"]
acs: ["AC-04", "AC-05", "AC-06", "AC-07", "AC-13"]
files_hint: ["apps/web/src/api/remoteFilter.ts", "apps/web/src/api/remoteFilter.test.ts", "apps/web/src/api/search.ts", "apps/web/src/features/remote-filter/", "docs/design-system.md"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Add the web remote-filter client, the LocationFilterBar and the CountryChoice on SCR-01

## Place in the sequence

- **Blocked by:** — (built against the contract; server tasks run in parallel) · **Blocks:** T12 — Wire the filter into the main list · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to choose my country once and have job-radar remember it
> **So that** the filter works every time I open the list
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The controls: choose or change the country, switch the filter, look at another country and go back (US-04, US-05).

## Inlined context

> Any filter change (choose or change the country, switch on or off, start or end a look) is followed by `runSearch` with the field's skills. The list reloads from the top with SearchList's existing loading state (ADR-0002). The bar's text always comes from `SearchResult.location_filter`, so it describes the list on screen, never a setting not yet applied.
>
> | settings loading | `getRemoteFilterSettings` in flight on opening. The bar shows a one-line placeholder | SkeletonRow (one line) |
> | settings error | `getRemoteFilterSettings` 500. The bar's place holds the API message with Retry. The list still loads | InlineBanner (error, Retry) |
> | no country | `mode: none` (AC-04). "Choose your country to hide roles you can't take from there", actions "Choose country" and "Look at another country" | NEW: LocationFilterBar, Button ×2 |
> | own | `mode: own`. "Open to 🇵🇱 Poland", actions "Change", "Other country" and "Switch off" | LocationFilterBar, Button ×3 |
> | off | `mode: off` (AC-07). "Location filter is off", action "Switch on" | LocationFilterBar, Button |
> | look | `mode: look` (AC-06). "Showing postings open to 🇩🇪 Germany", action "Back to Poland", or "Back to all postings" when no country is chosen | LocationFilterBar, Button |
> | switching | `setFilterOn` / `setLook` (end) in flight. The pressed action is pending and the bar's other actions are disabled. The list stays until the new search answers | Button (pending) |
> | switch error | `setFilterOn` / `setLook` 500. The bar keeps its earlier state and shows the API message with Retry under its text | InlineBanner (error, Retry) |
>
> **CountryChoice** — open: "Choose country" / "Change" (label "Your country") or "Look at another country" / "Other country" (label "Look at postings open to"). A labelled text input with suggestions from `countries` (name and flag), plus "Save" or "Look", and "Cancel". Enter submits and Escape cancels. · saving: submit pending, input stays editable. · unknown name: 400 `REMOTE_FILTER_UNKNOWN_COUNTRY` (AC-05). "No country matches that name." under the input in `text-danger` with `aria-invalid`; list and saved country unchanged. Validation is live once flagged. · saved: `chooseCountry` 200 closes and the list reloads filtered, filter on even if it was off (AC-04, AC-13); `setLook` 200 closes and reloads in look mode (AC-06). · save error: 500 message with Retry inside the choice, which stays open with the typed name. · cancelled: closes, nothing sent.
>
> Every action in the bar and the choice is at least 44×44 px; on phones the actions wrap with `gap-2` and never scroll sideways.
>
> — `screens.md §SCR-01, Location bar and list (bar rows) + CountryChoice, abridged` · wireframes 01-a … 01-f: [screens.md](../screens.md)

> | LocationFilterBar | … composes Button and InlineBanner |
> | CountryChoice | … needs suggestions from `countries` (a native `<datalist>`) and the server's unknown-name answer. It composes Button and InlineBanner, and follows SkillsField's error pattern (`aria-describedby`, `aria-invalid`) |
>
> — `screens.md §New components, abridged` · full text: [screens.md](../screens.md)

Reuse: `components/Button.tsx`, `InlineBanner.tsx`, `SkeletonRow.tsx`; error pattern from `features/search/SkillsField.tsx`; mutation pattern from `features/tracking/mutations.ts`; client pattern from `api/tracking.ts`. Register both new components in `docs/design-system.md`.

> **Hard rule:** Semantic tokens only, mobile-first from 360 px. The country choice, look, back and off actions are each at least 44×44 px. · TanStack Query: one query for settings and countries, mutations for the country and on/off. Any change invalidates the search query, which reloads from the top (ADR-0002).
>
> — `sad.md §8, UI styling + UI data access, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([screens.md](../screens.md) · [openapi.yaml](../contracts/openapi.yaml) · [spec.md](../spec.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Calls `GET /api/v1/remote-filter/settings` → `{ country: Country|null, filter_on, countries }`; `POST …/country { name }`; `POST …/filter { on }`; `POST …/look { name | null }` → `{ look }`; 400 `REMOTE_FILTER_UNKNOWN_COUNTRY`. `Country = { code, name, flag }`. Adds to `api/search.ts` types: `SearchResult.hidden_count`, `SearchResult.location_filter { mode: "none"|"own"|"look"|"off", country: Country|null }`, `Posting.location_check: "exception"|"hours_only"|"not_recognised"|"not_stated"|null`.

— `contracts/openapi.yaml, remote-filter paths + schemas Country, LocationFilter, LocationCheck, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-04 — happy

> **Given** the owner has never chosen a country
> **When** they open the main screen, choose Poland, and later close and reopen the app
> **Then** before choosing they see every open posting with a prompt to choose their country; after choosing, the list is filtered for Poland; on reopening, Poland is still chosen and the filter is still on
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — error

> **Given** the owner is choosing their country
> **When** they type a name that is not a country job-radar knows (for example "Polnd" or "Europe")
> **Then** no country is chosen, they are told that no country matches that name, and the list and the saved country stay as they were
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** the owner's country is Poland
> **When** they choose to see postings open to Germany
> **Then** the list shows the postings that fit or need a check for Germany under the same rules, the screen says it is showing postings open to Germany, the owner's saved country stays Poland, and the next time the main screen is opened it filters for Poland again; an owner who has not chosen a country yet can still look at Germany this way, and afterwards is back to the unfiltered list with the prompt to choose (AC-04)
>
> — `spec.md §5, AC-06, verbatim (note inlined in T07)` · full text: [spec.md](../spec.md)

### AC-07 — happy

> **Given** the filter for Poland hides 38 of 140 open postings that match the owner's skills
> **When** the list is shown
> **Then** the owner sees "102 postings — 38 hidden, not open to Poland", pages through those 102 (search AC-15), and has one action to switch the filter off; switching it off shows all 140 without any "check" or hidden distinction, and the filter stays off on the next opening until the owner switches it on, with the screen saying the location filter is off and offering to switch it on
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy

> **Given** the owner's country is Poland
> **When** they change it to Portugal
> **Then** the list is filtered for Portugal at once, Portugal is remembered for the next opening, and the filter is switched on if the owner had it off
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `apps/web/src/api/remoteFilter.ts` (+ `.test.ts`): typed client for the four operations
- [ ] `apps/web/src/api/search.ts`: `hidden_count`, `location_filter`, `location_check` types
- [ ] `apps/web/src/features/remote-filter/queries.ts`: settings query + mutations (invalidate search on success)
- [ ] `features/remote-filter/LocationFilterBar.tsx`: renders from `location_filter` (+ settings for "Back to <own>"); every state in the bar table
- [ ] `features/remote-filter/CountryChoice.tsx`: in-place input with `<datalist>`, Save/Look/Cancel, Enter/Escape, unknown-name error with `aria-invalid` + `aria-describedby`
- [ ] Testing Library tests for both components (each mode, unknown name, pending, error with Retry)
- [ ] `docs/design-system.md`: register LocationFilterBar and CountryChoice

## Edge cases

| Case | Behaviour |
|---|---|
| "Polnd" saved | inline "No country matches that name."; choice stays open; no search run |
| Escape while saving | ignored until the answer (input stays editable) |
| Look with no own country → Back | "Back to all postings"; mode none, prompt again |
| Settings 500 | bar shows error + Retry; list still loads |
| 360 px | actions wrap with `gap-2`; no horizontal scroll; each ≥44×44 |

## Definition of Done

**Done when:** the LocationFilterBar and CountryChoice tests pass for every bar mode (none, own, off, look, loading, switching, error) and every choice state (open, saving, unknown name, saved, save error, cancelled), and `remoteFilter.test.ts` passes.

- [ ] web tests pass (`pnpm --filter @job-radar/web test`)
- [ ] new components registered in `docs/design-system.md`
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
