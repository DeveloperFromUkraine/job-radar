---
id: T07
title: "Implement the settings use cases: choose country, switch on/off, start or end a look, the country list, and the active filter for a visit"
layer: "app"
deps: ["T02", "T06"]
blocks: ["T09", "T10"]
acs: ["AC-04", "AC-05", "AC-06", "AC-07", "AC-13"]
files_hint: ["apps/server/src/modules/remote-filter/app/settings.ts", "apps/server/src/modules/remote-filter/app/countries.ts", "apps/server/test/remote-filter-settings.integration.test.ts"]
owner: "Volodymyr Kozlov"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every quoted chunk ends with its provenance signature; the source always
wins. To the executing agent: work from what is inlined here; if a slice is insufficient, ambiguous,
or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T07 — Implement the settings use cases: choose country, switch on/off, start or end a look, the country list, and the active filter for a visit

## Place in the sequence

- **Blocked by:** T02 — Build the country vocabulary, T06 — Write the settings repo · **Blocks:** T09 — Expose remote-filter's routes, T10 — Make search's main list location-aware · **Wave:** 3.
- **Lane:** own lane.

## Why (user story)

> **As an** owner
> **I want** to see the postings open to another country with the same rules, for a moment
> **So that** I can weigh a move or a contract there without changing my own setting
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Every rule about the owner's country, the on/off state and the one-off look, plus the one question search asks first: "which filter applies to this visit?" (US-03 and US-05 rest on it too.)

## Inlined context

> - The owner's country (an ISO alpha-2 code) and the on/off state live in one row of a new `remote_filter_settings` table. No country chosen means no filter (AC-04). Choosing or changing a country switches the filter on (AC-13).
> - The one-off look lives in the same row: the look country and when it was started. Search passes its current visit start, and a look started before it (an earlier visit) is ignored, which ends it with no clean-up job. Starting a look never touches the owner's own country or on/off state (AC-06).
>
> — `sad.md §4, Inline decisions, verbatim` · full text: [sad.md](../sad.md)

> `look_started_at` — When the look was started. Search passes its current `search_state.visit_started_at` when it asks for the active filter; the look is active only if `look_started_at` is not before it. A reload stays in the same visit and keeps the look; a new visit (more than 30 min away) starts later and ends it, with no clean-up job (AC-06). Remote-filter never reads search state. Cleared together with `look_country` on "back".
>
> — `data-model.md §Entities, remote_filter_settings.look_started_at, verbatim` · full text: [data-model.md](../data-model.md)

> `SearchResult.location_filter.mode` — none (country NULL, no active look), own, look (`look_started_at` ≥ visit start), off (`filter_on` false)
>
> — `contracts/api-sync-report.md §A, Field origins, verbatim` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> | Error handling | Envelope `{ "error": { "code", "message" } }` via `AppError`. A name that matches no known country is refused with its own code and the message "No country matches that name", leaving the saved country unchanged (AC-05); an unknown look country in a search is refused the same way. |
>
> — `sad.md §8, Error handling, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Dependencies run search → remote-filter → collector through `app/` exports; nothing calls back into search, so there is no cycle.
>
> — `adr/0001, Consequences/Positive, verbatim` · full text: [ADR-0001](../adr/0001-ship-the-filter-as-a-new-remote-filter-module-plus-main-screen-controls.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml)) and follow it. Do not guess.

## Data delta

Reads and writes `remote_filter_settings` (`country`, `filter_on`, `look_country`, `look_started_at`) through T06's repo only. No schema change.

— `data-model.md §Entities, remote_filter_settings, abridged` · full text: [data-model.md](../data-model.md)

## API contract

These are the use cases behind (wired in T09):
- `getRemoteFilterSettings` → `RemoteFilterSettings { country: Country|null, filter_on, countries: Country[] (ordered by name) }`; the look is **not** reported here.
- `chooseCountry { name }` → settings; saves the country and switches the filter on; a look in progress is left as it is. Unknown → `400 REMOTE_FILTER_UNKNOWN_COUNTRY` "No country matches that name.".
- `setFilterOn { on }` → settings; during a look, switching does not end the look.
- `setLook { name | null }` → `LookState { look: Country|null }`; `null` ends the look. Unknown → 400 as above.

— `contracts/openapi.yaml, operationIds getRemoteFilterSettings / chooseCountry / setFilterOn / setLook, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

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
> > The look at Germany lasts until the owner takes the visible "back to Poland" action or a new visit starts (a visit as in search AC-14 — opening the main screen after more than 30 minutes without it); a new search, a refresh, or a trip to the marked view and back keeps it. Choosing a country to look at switches the filter on for that look, even if the owner had it off, and when the look ends the owner's own on/off state returns. During the look, AC-05, AC-07 and AC-08 apply with Germany in place of the owner's country ("38 hidden, not open to Germany").
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

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

- [ ] `app/countries.ts`: `countries()` (T02's list, ordered by name), `lookup(name)` → `Country` or throws `AppError("REMOTE_FILTER_UNKNOWN_COUNTRY", "No country matches that name.", 400)`
- [ ] `app/settings.ts`: `readSettings`, `chooseCountry(name)` (save + `filter_on = true`), `setFilterOn(on)`, `setLook(name | null, now)`, `activeFilter(visitStartedAt)` → `{ mode: none|own|look|off, country }`
- [ ] `activeFilter`: an active look wins (mode `look`, filter on regardless of `filter_on`); else no country → `none`; else `filter_on` → `own`, otherwise `off` (country = the owner's)
- [ ] `apps/server/test/remote-filter-settings.integration.test.ts` with a fake clock and T06's fixture

## Edge cases

| Case | Behaviour |
|---|---|
| "Polnd" / "Europe" to chooseCountry or setLook | 400 `REMOTE_FILTER_UNKNOWN_COUNTRY`; row unchanged |
| chooseCountry while filter off | country saved, `filter_on` → true (AC-13) |
| Look started, owner had filter off | `activeFilter` → mode `look`; ending it → mode `off` again |
| Look from an earlier visit (`look_started_at` < visit start) | ignored → owner's own mode |
| Look with no country chosen; back | mode `none` again (prompt) |
| setFilterOn with no country | saved; `activeFilter` still `none` |

## Definition of Done

**Done when:** `remote-filter-settings.integration.test.ts` passes every row of the edge-case table plus AC-04's reopen (a fresh deps on the same DB file reads Poland, on) and AC-13's change to Portugal.

- [ ] `remote-filter-settings.integration.test.ts` passes
- [ ] remote-filter never imports from `search/`
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck clean (`pnpm lint`, `pnpm build`)
