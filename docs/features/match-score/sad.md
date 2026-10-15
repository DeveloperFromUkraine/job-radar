---
status: Draft
owner: "Volodymyr Kozlov"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-15"
feature_size: "M"
target_surfaces: [backend-service, web-frontend]  # decided in §4 (ADR-0001) — subset of: backend-service | web-frontend | mobile-app | desktop-app | cli | worker | library-sdk. Read (never re-derived) by api/sequences/tasks/plan-tests/review → _shared/surfaces.md
---

# Software Architecture Document — match-score

<!-- 12 Arc42 sections. Empty section → <!-- N/A: <one-line reason> -->. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

**Intent.** The match score tells the owner, on every posting in their list, how well it fits what they are looking for — a number from 0 to 100 split into skills, role type, seniority and terms, with a fit note of at most 40 words on why it fits and what is missing. The owner describes what they are looking for once, in a short editable profile, which they can draft from an uploaded CV. In the background, job-radar asks a language model to score each posting in the owner's list against the profile, within a monthly scoring cap the owner sets. The list stays newest first; "best match first" is a choice, in which postings without a score come first. A score orders the list and never hides a posting, and every posting without one says why. Scoring's own health shows beside the sources' on the source health screen. This is the first feature that sends personal data off the owner's machine: the CV text once, to draft the profile, and the profile — never a name or contact detail — with every scoring, only after the owner has agreed once (spec AC-20).

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **A score never costs the owner a posting.** 0 postings left out of the list or its counts because of their score; every posting without a score says why (pending, not scored — provider or key problem, cap reached, could not be scored, no profile yet).
2. **Spending stays within the owner's cap.** The month's scoring and profile drafting never exceed the scoring cap (default $5); 0 attempts started after the cap is reached.
3. **Personal data leaves only as agreed.** 0 scorings carry a name, email, phone number, address or profile link; nothing is sent off the machine before the owner's one-time agreement.
4. **The list stays fast and scores arrive fresh.** ≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings, scores and a profile, in either order; a posting entering the owner's list is scored within 15 minutes p95 while the cap is not reached and the provider answers.

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Owner | Sets up and edits the profile (from a CV or by hand), reads scores and fit notes, orders the list by best match, sets the scoring cap, watches scoring health (US-01 – US-06) | No |
| Visitor | None. Must not upload a CV, read or change the profile, or spend the scoring cap; cannot connect at all (AC-17) | No |
| Tech Lead | SAD approval; owner of the model choice and the scoring contract | Yes |
| Security Lead | Security review required by spec §6.1: the first personal data sent off the machine, a new secret, a new outside party; owner of spec §8 Q2, resolved in §2 | Yes |

## 2. Constraints

**Technical.**
- TypeScript on Node.js 22+ (`.nvmrc`), pnpm workspaces: `apps/server` + `apps/web` (project ADR `docs/adr/0001-typescript-monorepo-react-fastify.md`).
- Server: Fastify `^5.12`, one process on loopback that also serves the built SPA (collector ADR-0001, ADR-0007). Inbound request bodies are limited to Fastify's default 1 MB; no multipart support is installed; every state-changing request must carry a JSON body and must not be cross-site (`core/access.ts`).
- Web: React 19 + Vite single-page app, react-router 8 (routes `/` and `/sources` today), TanStack Query 5, Tailwind v4 with the semantic tokens in `apps/web/src/styles/tokens.css` — which already define `--score-high`, `--score-mid` and `--score-low`.
- Datastore: one SQLite file through `better-sqlite3` + Drizzle ORM; forward-only `drizzle-kit` migrations with a file backup before each migrate (project ADR `docs/adr/0003-sqlite-with-drizzle.md`). One connection shared by every module, synchronous on the server's event loop.
- Language model: Claude through the official Anthropic TypeScript SDK (`docs/architecture-map.md`: "the model is chosen in the match-score feature"). Not installed yet; neither is any PDF or Word reader.
- Background work runs in the server process, as the collector's scheduler does: started on the server's ready hook, stopped through an abort signal on close, in-flight work awaited (`collector/index.ts`, collector ADR-0002).
- Postings, listings, merges and the "updated posting" rule belong to the collector (collector ADR-0004, ADR-0005; `collector/infra/repo/postings.ts`); a posting's change is detected by comparing title, description, location restriction and link, with no stored fingerprint. The list, its snapshots, its fixed order and paging belong to search (search ADR-0003, applied-skipped ADR-0002); location verdicts to remote-filter (remote-filter ADR-0002); marks to tracking.
- Layering per project ADR `docs/adr/0002-feature-modules-mirror-roadmap.md`: `modules/<name>/{domain,app,infra,ports}`; a module reaches another only through that module's `app/` exports.

**Organisational.**
- One owner-developer. Size M, route standard (`.size`, `.route`). No deadline is stated.
- Roadmap wave 4: step 4 runs in parallel with step 10 (LinkedIn adapter, `collector/infra/sources/`), which does not touch the list.

**Conventions.**
- `CLAUDE.md` (layout, layering, errors, IDs, persistence, tests, UI) and `docs/design-system.md` (mobile-first posture, component inventory, 44×44 px touch targets).
- Errors use one envelope `{ "error": { "code", "message" } }`, shaped only by `core/errors.ts`; expected failures throw `AppError(code, message, status)`.
- IDs are UUIDv7 from `core/id.ts`, generated in the app. Tests use Vitest: unit beside the code, server integration in `apps/server/test/` against a temp SQLite file, web with Testing Library.

**Regulatory / external.**
- Data classification is confidential (spec §6.1): the CV and the profile describe the owner's career, level and salary expectations.
- Provider data terms (resolves spec §8 Q2, owner decision 2026-10-15): the standard Anthropic API data terms are accepted; zero data retention is not required. Exposure is kept small by design: the CV text is sent once, to draft the profile, and is not kept locally; afterwards only the profile — no name or contact detail — and each posting's public text are sent. The one-time notice (AC-20) names the provider and points to its terms.
- Source terms are unchanged: postings keep naming their sources (`CLAUDE.md` §Source terms). Sending a posting's public text to the provider for scoring is the owner's personal use and does not republish it.

## 3. Context and scope

The owner runs job-radar on their own laptop. The collector fills the local database from remote job boards, search shows the owner the open postings that match their skills, the remote filter hides those not open to their country, and marks take decided postings out of the list. This feature adds one outside party, the Claude API: job-radar sends it the owner's CV text once to draft a profile, and the profile with each posting's text to score the posting. It is the first trust boundary crossed in both directions — personal data goes out only after the owner's one-time agreement, and what comes back is model output built from third-party posting text, so it is checked against a fixed shape and shown as plain text before anything uses it.

<!-- brownfield: architecture-map.md is stale (reflects 133499e); the code was scanned directly on 2026-10-15. Modules: health, collector (postings, listings, merge, source readers, scheduler with abort-signal shutdown, source health + problems endpoint), search (in-memory snapshots of ordered ids, order fixed at load, verdicts and checks computed at snapshot time), tracking (marks), remote-filter (settings singleton, verdicts on read). No LLM SDK, file upload or PDF/Word reader yet; latest migration 0005. -->

**External systems (in / out):**

| Actor or system | Type | Interaction |
|---|---|---|
| Owner | Person | Sets up the profile (CV or by hand), reads scores and fit notes, orders the list, sets the scoring cap |
| Visitor | Person (external) | Can reach the machine over the network but cannot connect: loopback only (AC-17, collector ADR-0007) |
| Other web sites | System (external) | Pages open in the owner's browser; a request from them to upload a CV, change the profile or the cap is refused as cross-site (AC-17) |
| Job sources | System (external) | Read by the collector, unchanged; their posting text is what gets scored |
| Claude API (Anthropic) | System (external) | New. Receives the CV text once (draft profile) and the profile with each posting's text (scoring), over HTTPS with the owner's provider key; returns a draft or a score that job-radar checks before use |

**C4 Context (L1):**

```mermaid
C4Context
    title match-score - System Context

    Person(owner, "Owner", "A software engineer looking for remote roles that fit their skills, level and terms")
    Person_Ext(visitor, "Visitor", "Someone on the same network who is not the owner")

    System(jr, "job-radar", "Collects postings and scores each one in the owner's list against the owner's profile, on the owner's machine")
    System_Ext(sources, "Job sources", "Remote job boards read by the collector")
    System_Ext(claude, "Claude API", "Anthropic's language model; drafts a profile from CV text and scores a posting against a profile")
    System_Ext(sites, "Other web sites", "Pages open in the owner's browser")

    Rel(owner, jr, "Sets up the profile, reads scores, orders the list, sets the cap", "browser, loopback")
    Rel(jr, sources, "Reads postings", "HTTPS")
    Rel(jr, claude, "Sends CV text once and profile plus posting text per score", "HTTPS")
    Rel(visitor, jr, "Cannot connect", "refused")
    Rel(sites, jr, "Cannot act for the owner", "refused as cross-site")
```

## 4. Solution strategy

**Target surfaces: `backend-service` + `web-frontend`** ([ADR-0001](adr/0001-ship-match-score-as-a-new-matching-module-plus-a-profile-screen-and-card-additions.md)). The profile, the background scorer, spend accounting, CV reading and scoring health live in a new `matching` server module, in the existing server process — no separate worker. The UI stays the existing React SPA (react-router, TanStack Query, the design-system components and tokens), gaining a `/profile` route (SCR-03) and additions to the main screen (SCR-01) and source health (SCR-02). No UI-architecture change: inline, not a separate decision.

**Top strategic choices (the seeds for ADRs):**

1. **Claude Opus 5.5 at low effort, one posting at a time, in the background** ([ADR-0002](adr/0002-score-with-claude-opus-5-5-at-low-effort.md), [ADR-0003](adr/0003-score-one-posting-at-a-time-with-the-messages-api-in-a-background-scorer.md)). Quality of the parts and the fit note drives the success KPI and resistance to planted wording (spec §7, AC-03), so the owner chose the strongest model over volume; at the $5 default about 270 scorings fit in a month, and the owner raises the cap for their full stream (AC-19). Ordinary requests, one at a time, keep a new posting's score within seconds (freshness ≤ 15 minutes p95) and make every attempt a single spend reservation; prompt caching of the instructions and profile lowers input cost.
2. **The list is search's; scores flow back through an injected reader** ([ADR-0004](adr/0004-read-scores-into-search-through-an-injected-reader-and-read-the-list-from-search.md)). Matching scores exactly the owner's list (AC-13), read from a new search export; search reads scores through a `ScoreReader` wired in `app.ts`, as it already reads location verdicts, and fixes scores and the best-match order when it builds a snapshot. No import cycle; one definition of the list.
3. **A score is stored once per posting and judged stale by fingerprints** ([ADR-0005](adr/0005-keep-one-score-per-posting-with-text-and-profile-fingerprints.md)). The score row records a hash of exactly the text that was scored and the profile version; a mismatch marks it stale (AC-06, AC-10) without touching the collector.
4. **Trust boundaries are enforced in code, not left to the model** ([ADR-0006](adr/0006-reserve-the-largest-possible-cost-before-each-attempt-and-settle-from-usage.md), [ADR-0007](adr/0007-extract-cv-text-locally-and-send-only-text.md), [ADR-0008](adr/0008-constrain-model-output-to-part-scores-and-compute-the-total-in-job-radar.md)). Money: a ledger reserves each attempt's largest possible cost before it starts, so the cap cannot be exceeded. Personal data: CV text is extracted and cleaned of contact details locally, so a scan is refused and contacts are removed before anything leaves the machine. Untrusted output: the model returns only part scores, a note and quoted claims in a fixed schema; job-radar validates them and computes the total itself, so planted wording cannot set the score.

Each tactical decision in later sections traces to one of these seeds. Tactical decisions that contradict a strategic choice are red flags — surface them in §11.

## 5. Building block view

Layered, as every module in the repo (project ADR 0002): `domain/` holds pure rules with no I/O, `app/` the use cases and the exports other modules may call, `infra/` the tables, the Claude client and the CV reader, `ports/` the routes. `matching` reads postings through `collector/app/` and the owner's list through a new `search/app/` export; search reads scores through a `ScoreReader` that `app.ts` wires in (ADR-0004). The scorer finds its work by polling: every 60 s (the collector scheduler's interval) it reads the owner's list and the score fingerprints and picks the next posting, and matching wakes it at once after a profile save, a cap change or a new search — no collector event is needed. Scoring health is matching's own; the web shows the main-screen problem marker when either the collector's problems or matching's scoring health report a problem, so the collector is unchanged.

**Internal decomposition:**

```
apps/server/src/modules/matching/
├── domain/       profile rules (fixed lists, field checks, contact detection), score total (weights 50/20/15/15, neutral rule),
│                 answer validation (AC-18), text fingerprint, cap rule (largest possible cost, month boundary)
├── app/          profile use cases (save, change-detection, notice consent), CV draft, scorer (queue, one attempt at a time,
│                 retry policy), scoring health, scoreReader export for search, cap settings
├── infra/        schema (matching_settings singleton, matching_scores, matching_spend), repo, claude client (SDK wrapper:
│                 structured output, usage, error classes), cv text extraction (PDF, DOCX, text)
├── ports/        routes: profile, CV draft, cap, notice, scoring health
└── index.ts      createMatching(deps) → { plugin, scoreReader, start/stop } registered in app.ts

apps/server/src/modules/search/   app/deps.ts gains ScoreReader; app/ gains ownerListIds(); snapshot keeps a score per posting
                                  and the best-match order; search_state keeps the chosen order (AC-11)
apps/web/src/                     routes/Profile.tsx (SCR-03), features/matching/ (score on PostingCard, order switch,
                                  no-profile and cap lines, notice step), features/source-health/ (scoring health block, marker)
```

Tables (shapes fixed in `data-model`): `matching_settings` — one row: the profile (fields per CONTEXT: Profile) and its version, the scoring cap, when the data notice was agreed; `matching_scores` — one row per scored posting: four parts, note, quoted claims, total, text fingerprint, profile version, strikes and last failure, removed with the posting; `matching_spend` — one row per attempt: kind (score / draft), reserved and settled cost, model, usage, outcome, time. The chosen list order lives in search's existing `search_state` row, beside the last skills.

**C4 Container (L2):**

```mermaid
C4Container
    title match-score - Containers

    Person(owner, "Owner", "Reads scores, edits the profile, sets the cap")

    Container_Boundary(jr, "job-radar") {
        Container(web, "Web SPA", "React 19, Vite, TanStack Query", "Main screen with scores and order switch, profile screen, source health with scoring health")
        Container(api, "Server", "Node 22, Fastify 5", "Collector, search, tracking, remote-filter and the new matching module with its background scorer")
        ContainerDb(db, "Local database", "SQLite via Drizzle", "Postings, marks, settings; new: matching settings and profile, scores, spend ledger")
    }

    System_Ext(claude, "Claude API", "Drafts a profile from CV text; scores a posting against the profile")
    System_Ext(sources, "Job sources", "Remote job boards")

    Rel(owner, web, "Uses", "browser")
    Rel(web, api, "Calls", "JSON over loopback")
    Rel(api, db, "Reads and writes", "better-sqlite3")
    Rel(api, claude, "Drafts and scores", "HTTPS, official SDK")
    Rel(api, sources, "Collects postings", "HTTPS")
```

## 6. Runtime view

Participants are the §5 containers, with the server shown by module. Messages are semantic; endpoint-level detail arrives at the `api` stage. The `sequences` stage covers the remaining ACs (profile edit, cap change, stale scores, marked view).

**Critical flow 1: background scoring of one posting** (AC-01, AC-06, AC-12 – AC-14, AC-18; ADR-0003, ADR-0004, ADR-0006, ADR-0008)

```mermaid
sequenceDiagram
    participant Scorer as Matching scorer
    participant Search
    participant Collector
    participant DB as Local database
    participant Claude as Claude API

    Note over Scorer: wakes every 60 s, and at once after a profile save, a cap change or a new search
    Search-->>Scorer: posting ids in the list
    Scorer->>DB: scores and fingerprints for those ids
    Scorer->>Collector: posting texts for ids without a current score
    Scorer->>Scorer: pick next - no score first, then stale, newest first
    Scorer->>DB: reserve largest possible cost if spent + reserved + cost fits the cap
    alt cap would be exceeded
        DB-->>Scorer: refused
        Scorer->>Scorer: stop until next month or a raised cap - postings show cap reached
    else reserved
        Scorer->>Claude: instructions + profile (cached) + posting text as a data block, fixed output schema
        alt usable answer
            Claude-->>Scorer: four parts, note, quoted claims, usage
            Scorer->>Scorer: validate, compute total with fixed weights
            Scorer->>DB: store score with text fingerprint and profile version, settle cost from usage
        else unusable answer or refusal
            Claude-->>Scorer: answer that fails validation
            Scorer->>DB: settle cost, add a strike - third strike marks could not be scored
        else provider unreachable, rate-limited or key refused
            Claude-->>Scorer: error
            Scorer->>DB: keep the reservation as spent (no answer), record the problem for scoring health
            Scorer->>Scorer: posting shows not scored with the reason, retry in at most 15 minutes or after a restart with a key
        end
    end
```

**Critical flow 2: loading the list in best-match order** (AC-02, AC-11, AC-15; ADR-0004)

```mermaid
sequenceDiagram
    actor Owner
    participant Web as Web SPA
    participant Search
    participant Matching
    participant DB as Local database

    Owner->>Web: opens the main screen, order set to best match first
    Web->>Search: run search with skills and the kept order
    Search->>DB: open postings, marks, location verdicts as today
    Search->>Matching: scores for the matching postings through the score reader
    alt scores readable
        Matching->>DB: current scores and fingerprints
        Matching-->>Search: per posting - score, parts, note, claims and state (scored, earlier version, pending, not scored - provider or key problem, cap reached, could not be scored, no profile)
        Search->>Search: order - postings with no score newest first, then scores high to low, ties newest first
    else scores unreadable (fail-open, api-sync F-3)
        Matching-->>Search: error
        Search->>Search: newest first with no matches - a score only orders, so the list never waits on it
    end
    Search->>Search: fix order and scores in the snapshot, same total and counts as newest first
    Search-->>Web: first 50 with their scores and states
    Web-->>Owner: cards with score and note, or why there is none
    Owner->>Web: asks for more
    Web->>Search: next page of the same snapshot
    Search-->>Web: next 50 in the fixed order, none repeated or skipped
```

**Critical flow 3: drafting the profile from a CV** (AC-07 – AC-09, AC-20; ADR-0006, ADR-0007)

```mermaid
sequenceDiagram
    actor Owner
    participant Web as Web SPA
    participant Matching
    participant DB as Local database
    participant Claude as Claude API

    Owner->>Web: chooses a CV file on the profile screen
    alt first time anything would leave the machine
        Web-->>Owner: data notice - what is sent and to whom
        Owner->>Web: agrees
        Web->>Matching: record agreement
        Matching->>DB: notice agreed at
    end
    Web->>Matching: CV file as encoded text in a JSON body
    Note over Web: checks kind and 5 MB size before sending - over size shows the AC-08 message at once
    Matching->>Matching: check kind and size again, extract text locally
    alt no text, unsupported, empty or over 5 MB
        Matching-->>Web: what is wrong and which files work - nothing sent
    else text extracted
        Matching->>Matching: remove emails, phone numbers, addresses and links, list what was removed
        Matching->>DB: reserve largest possible cost
        Matching->>Claude: cleaned CV text, fixed profile schema
        Claude-->>Matching: draft profile, usage
        Matching->>Matching: validate, map to fixed lists, mark not mapped, drop the CV text
        Matching->>DB: settle cost
        Matching-->>Web: draft beside the current profile, removed details
        Owner->>Web: confirms
        Web->>Matching: save profile
        Matching->>DB: replace profile, bump profile version - all scores become stale
    end
```

### Flow 4: saving the profile by hand or after an edit (AC-10, AC-16, AC-20, AC-21; ADR-0005)

```mermaid
sequenceDiagram
    autonumber
    actor O as user (owner)
    participant U as ui (profile screen SCR-03)
    participant M as service (matching)
    participant D as data-store
    participant SC as service (matching scorer)

    Note over O,M: Precondition: the profile screen is open with an empty or the current profile
    O->>U: fills in or edits the fields and saves
    U->>U: checks the fields before sending
    alt the data notice was never agreed
        U-->>O: data notice - the profile and each posting's text go to the LLM provider with every scoring, never a name or contact
        alt owner declines
            O->>U: declines
            U-->>O: back to the editor, profile not saved, nothing sent
        else owner agrees
            O->>U: agrees
            U->>M: record agreement
            M->>D: notice agreed at
            Note over M,D: persists the notice agreement (once)
        end
    end
    U->>M: save profile
    M->>M: validate - a core skill, salary with currency and period, years 0 to 60, skills up to 50 characters, no email, phone or web address in any field
    alt a field is invalid
        M-->>U: which field is wrong and what it must be
        U-->>O: field error, profile and scores unchanged
    else notice not agreed (guard)
        M-->>U: refused, nothing saved or sent
    else valid
        M->>D: current profile and version
        D-->>M: current profile
        alt no profile field changed
            M-->>U: saved, nothing becomes stale, nothing re-scored
        else first profile or a profile field changed
            M->>D: replace profile, bump profile version
            Note over M,D: persists the profile and its version - scores with an older version now read as stale
            M->>SC: wake
            M-->>U: saved
            U-->>O: back to the main screen, existing scores marked scored against your previous profile
            Note over SC,D: postings with no score first, then stale ones, newest first, within the cap (flow 1)
        end
    end
    Note over O,M: Postcondition: a saved profile holds no name or contact detail, and best match first uses new scores from the next load or refresh
```

The owner fills in or edits the profile and saves. If the data notice was never agreed, the screen shows it first. Declining returns to the editor with nothing saved or sent. Agreeing records the agreement once. Matching validates every field. An invalid field comes back named, with what it must be, and the profile and scores stay unchanged. Matching also refuses a save without an agreement, as a guard. A valid save that changes no profile field makes nothing stale. A first profile, or a real change, replaces the profile and bumps its version, which makes every score stale, and wakes the scorer. On the main screen, existing scores keep showing, marked "scored against your previous profile". The scorer redoes them after the postings that have no score.

### Flow 5: drafting from a CV, refusals and declines (AC-07, AC-08, AC-20; ADR-0006, ADR-0007)

```mermaid
sequenceDiagram
    autonumber
    actor O as user (owner)
    participant U as ui (profile screen SCR-03)
    participant M as service (matching)
    participant D as data-store
    participant X as external-system (LLM provider)

    Note over O,M: Precondition: the owner chose a readable CV file - flow 3 shows the agreed, successful path and the unreadable-file refusal
    alt the data notice was never agreed and the owner declines it
        U-->>O: data notice
        O->>U: declines
        U-->>O: CV not read, nothing sent, profile unchanged
    else notice agreed
        U->>M: CV file in a JSON body
        M->>M: extract text locally, remove contact details
        M->>D: reserve the largest possible cost of a draft
        alt cap would be exceeded
            D-->>M: refused
            M-->>U: the draft cannot be made, monthly cap reached, resumes on the first of next month
        else reserved
            M->>X: cleaned CV text, fixed profile schema
            alt provider unreachable, rate-limited, key missing or refused
                X-->>M: error
                M->>D: keep the reservation as spent (no answer)
                Note over M,D: persists a spend entry - kind draft, outcome failed
                M-->>U: why the draft could not be made, in plain language
            else answer fails validation
                X-->>M: unusable draft, usage
                M->>D: settle cost from usage
                M-->>U: the draft could not be made, try again later
            else usable draft
                X-->>M: draft profile, usage
                M->>D: settle cost from usage
                Note over M,D: persists a spend entry - kind draft, outcome answered
                M-->>U: draft beside the current profile, removed details listed
                O->>U: declines the draft
                U-->>O: current profile unchanged
            end
        end
        M->>M: drop the CV text in every branch
    end
    Note over O,M: Postcondition: after any refusal or decline the profile is unchanged and the CV is not kept - the owner uploads it again later
```

This flow adds the paths flow 3 leaves out. If the owner declines the one-time data notice, the CV is not read and nothing is sent. Once the notice is agreed, matching extracts the text locally, removes contact details and tries to reserve the draft's largest possible cost. If that would exceed the cap, the owner is told the draft cannot be made until next month. If the provider is unreachable, rate-limited, or the key is missing or refused, the reservation stays as spent and the owner is told why. If the answer fails validation, its real cost is settled and the owner is told to try again later. If a usable draft comes back and the owner declines it, the current profile stays as it was. In every branch the CV text is dropped, so the owner uploads it again later.

### Flow 6: changing the scoring cap (AC-19; ADR-0006)

```mermaid
sequenceDiagram
    autonumber
    actor O as user (owner)
    participant U as ui (profile screen SCR-03)
    participant M as service (matching)
    participant D as data-store
    participant SC as service (matching scorer)

    Note over O,M: Precondition: scoring is running, or stopped at the cap this month
    O->>U: sets a new scoring cap
    U->>M: save scoring cap
    alt outside 0 to 100 dollars
        M-->>U: the cap must be from 0 to 100 dollars, cap unchanged
    else valid
        M->>D: save cap
        Note over M,D: persists the scoring cap - no score becomes stale
        M->>D: this month's settled and reserved spend
        D-->>M: spent so far
        alt cap above what is spent
            M->>SC: wake
            M-->>U: saved, scoring resumes
            Note over SC,D: newest first until an attempt no longer fits under the new cap (flow 1)
        else cap at or below what is spent, or 0
            M-->>U: saved, scoring stopped until next month, or paused at 0
        end
    end
    U-->>O: the cap with this month's spend
    Note over O,M: Postcondition: no attempt starts unless its largest possible cost fits under the cap
```

The owner sets a new cap on the profile screen. A value outside $0–$100 is refused and the cap stays as it was. A valid cap is saved, which makes no score stale. Matching then compares the cap with this month's spend. If the cap is above it, the scorer wakes and resumes newest first until the next attempt no longer fits. If the cap is at or below the spend, or is $0, scoring stays stopped until next month, or paused. The screen shows the cap beside this month's spend.

### Flow 7: a scored posting changes, its score goes stale and is redone (AC-06, AC-18; ADR-0005)

```mermaid
sequenceDiagram
    autonumber
    participant C as service (collector)
    participant SC as service (matching scorer)
    participant D as data-store
    participant X as external-system (LLM provider)

    Note over C,D: Trigger: a collection run finds the posting's text changed at its source, or a listing from another board merges into it
    C->>D: update the posting or attach the merged listing
    Note over C,D: persists the posting as today - the collector is unchanged and sends no event
    Note over SC: next wake, every 60 s (flow 1)
    SC->>D: the posting's score with its text fingerprint and profile version
    SC->>SC: fingerprint the posting's current text
    alt fingerprint and profile version match (idempotency key)
        SC->>SC: skip - a posting seen again unchanged keeps its score, nothing is spent
    else fingerprint differs
        Note over SC,D: the old score stays shown, marked scored against an earlier version of this posting
        SC->>SC: queue after postings with no score, newest first
        SC->>X: score the current text - reserve, call, validate as flow 1
        Note over SC,X: provider problems retried at most every 15 minutes, a missing or refused key after a restart (flow 1)
        alt usable answer
            X-->>SC: parts, note, claims, usage
            SC->>D: replace the score with the new fingerprint and profile version, settle cost
            Note over SC,D: persists one score per posting, keyed by posting id, with text fingerprint and profile version
        else third unusable answer in a row
            X-->>SC: answer that fails validation
            SC->>D: settle cost, mark could not be scored until the posting or the profile changes
            Note over SC,D: dead-letter - the posting stays in the list in its place with its reason
        end
    end
```

The collector updates a posting as it does today and sends no event. On its next wake, the scorer compares the fingerprint of the posting's current text, and the profile version, with those stored on its score. That pair is the idempotency key. If both match, the posting was only seen again unchanged: it keeps its score and nothing is spent. If the fingerprint differs, the old score keeps showing with the "earlier version" mark. The posting is queued after the postings that have no score, newest first, and scored as in flow 1. A provider problem is retried at most every 15 minutes, and a key problem after a restart. A usable answer replaces the score and stores the new fingerprint. A third unusable answer in a row is the dead-letter case: the posting shows "could not be scored", stays in its place in the list, and is not tried again until it or the profile changes.

### Flow 8: changing the order or the skills, and the marked view (AC-11, AC-13; ADR-0004)

```mermaid
sequenceDiagram
    autonumber
    actor O as user (owner)
    participant U as ui (main screen SCR-01)
    participant S as service (search)
    participant M as service (matching)
    participant D as data-store
    participant SC as service (matching scorer)

    Note over O,U: Precondition: the main screen is open with a profile set up
    alt switches between newest first and best match first
        O->>U: chooses the order
        U->>S: run search with the chosen order
        S->>D: save the chosen order beside the last skills
        Note over S,D: persists the chosen list order in search state - kept for the next opening
        S->>M: scores for the snapshot through the score reader
        M-->>S: score and state per posting
        S-->>U: new snapshot in that order, first 50 (flow 2)
    else widens the skills, switches the remote filter off or starts a one-off look
        O->>U: changes skills or the filter
        U->>S: run search
        S->>M: scores for the snapshot through the score reader
        M->>SC: wake - a new list was read
        M-->>S: newly entered postings read as pending
        S-->>U: new snapshot, newly entered postings show pending
        SC->>S: the owner's current list
        S-->>SC: posting ids - marked and hidden postings are not among them
        Note over SC,D: newly entered postings scored in their turn, no score before stale, newest first (flow 1)
    else opens the marked view
        O->>U: opens the marked view
        U->>S: marked postings
        S->>M: last scores through the score reader
        M->>D: scores and fingerprints
        M-->>S: last score per posting, with its stale mark if any
        S-->>U: marked postings with their last score
        Note over M,SC: marked postings are never in the owner's list, so they are never scored again
    end
    Note over O,U: Postcondition: the scorer re-reads the list on every pass, so a posting marked or hidden before its turn is not scored
```

Switching the order runs a new search in that order. Search keeps the choice beside the last skills, so it is in place at the next opening, and the snapshot comes back as in flow 2. Widening the skills, switching the remote filter off or starting a one-off look builds a new snapshot. The score reader call during that build wakes the scorer, and the postings that newly entered show "pending". The scorer then reads the owner's current list from search, which never holds marked or hidden postings, and scores the new ones in their turn: postings with no score before stale ones, newest first. The marked view reads each marked posting's last score, with its stale mark if it has one. Marked postings are never in the owner's list, so they are never scored again. Because the scorer re-reads the list on every pass, a posting marked or hidden before its turn is never scored.

### Flow 9: scoring health and the main-screen problem marker (AC-12, AC-14, AC-18)

```mermaid
sequenceDiagram
    autonumber
    actor O as user (owner)
    participant U as ui (main screen SCR-01, source health SCR-02)
    participant C as service (collector)
    participant M as service (matching)
    participant D as data-store

    Note over O,M: Precondition: the scorer records every outcome and problem (flow 1)
    O->>U: opens the main screen
    U->>C: source problems
    C-->>U: source problems as today
    U->>M: scoring health
    M->>D: last success, this month's spend and cap, pending count, oldest pending age, could-not-be-scored count this month, current problem
    D-->>M: figures
    M-->>U: scoring health
    alt provider unreachable, key missing or refused
        U-->>O: problem marker, leading to source health
    else cap reached
        U-->>O: line above the list - scoring cap reached, resumes on the first of next month - and no problem marker
    else no scoring problem
        U-->>O: marker only if a source has a problem
    end
    opt opens source health
        O->>U: follows the marker or the navigation
        U-->>O: scoring health beside the sources - the problem with its reason and when scoring last succeeded, spend against the cap, pending and oldest pending age, could not be scored this month
    end
    Note over O,M: Postcondition: cards keep showing not scored with the reason per posting (flow 2), nothing is hidden, and the collector is unchanged
```

On opening the main screen, the web reads the collector's source problems as it does today, and matching's scoring health: last success, this month's spend and cap, pending count and oldest pending age, how many postings could not be scored this month, and the current problem. A provider or key problem raises the problem marker. A reached cap does not: it has its own line above the list saying when scoring resumes (screens.md SCR-01; review 2026-10-15 R6). With no scoring problem, the marker shows only for a source problem. The source health screen shows the scoring health block beside the sources. Cards still give each posting's own reason, nothing is hidden, and the collector does not change.

### Coverage

| Spec item | Shown in |
|---|---|
| US-01 | flows 1, 2, 7 |
| US-02 | flows 3, 5 |
| US-03 | flow 4 |
| US-04 | flows 2, 8 |
| US-05 | flows 1, 6 |
| US-06 | flows 1, 9 |
| AC-01 | flow 1 (usable answer) |
| AC-02 | flow 2 (same total and counts in either order) |
| AC-03 | flow 1 (posting text as a data block, fixed schema, total computed in job-radar), flow 2 (note shown on the card). The median bound is not runtime: the evaluation run (§10 QG-5) checks it |
| AC-04 | flow 1 ("compute total"): the neutral rule is a pure domain function, not a runtime step |
| AC-05 | flow 2 (location verdicts read as today, the score never changes them). The median bound is not runtime: evaluation run (§10 QG-5) |
| AC-06 | flow 7 |
| AC-07 | flow 3 (confirm), flow 5 (decline) |
| AC-08 | flow 3 (unreadable file), flow 5 (provider, key, cap) |
| AC-09 | flow 3 (contact details removed and listed) |
| AC-10 | flow 4 |
| AC-11 | flow 2 (order, paging), flow 8 (choice kept) |
| AC-12 | flow 1 (reservation refused), flow 9 (cap-reached line and marker) |
| AC-13 | flow 1 (list read from search), flow 8 (newly entered postings, marked and hidden not scored) |
| AC-14 | flow 1 (retry), flow 9 (scoring health, marker) |
| AC-15 | flow 2 ("no profile" state) |
| AC-16 | flow 4 (invalid field) |
| AC-17 | not runtime: the loopback-only server and the cross-site guard in `core/access.ts` apply to every request, unchanged (collector ADR-0007) |
| AC-18 | flow 1 (strike), flow 7 (third strike), flow 9 (count) |
| AC-19 | flow 6 |
| AC-20 | flow 3 (agree), flow 4 (first profile), flow 5 (decline) |
| AC-21 | flow 4 (first profile) |

### Flags from the runtime view

- **Participant naming:** flows 1–3 (from `design`) name concrete participants, such as Claude API, Search and Collector. Flows 4–9 use the generic vocabulary, with the §5 module in brackets. Both describe the same participants: the LLM provider is the Claude API (ADR-0002). Flows 1–3 were left as written, since they are not edited here.
- **Merge without a text change (AC-06):** staleness is judged by a fingerprint of the scored text (ADR-0005). So a listing merge that leaves the posting's scored text unchanged keeps its score current. AC-06 lists "a listing from another board merges into it" as a stale trigger without that condition. `data-model` and `tasks` should confirm that the fingerprint covers whatever a merge changes.
- **Stale posting reaching three strikes (AC-06 vs AC-18):** flow 7 shows "could not be scored" after the third unusable answer. The spec does not say whether the earlier stale score stays visible beside that reason. This is a candidate for `screens`.
- **Notice guard on the server:** flows 4 and 5 assume matching refuses a save or a draft when the notice was never agreed, not only the UI. This follows §10 QG-3 ("a draft or scoring before agreement sends nothing").

## 7. Deployment view

No new deployment unit: the `matching` module and its background scorer run in the existing server process on the owner's machine, started on the server's ready hook and stopped through an abort signal on close, as the collector is (ADR-0001, ADR-0003). One new migration adds the three matching tables and the order field on `search_state`; it runs with the existing `db:migrate`, which backs up the database first. New configuration, read once at start: the provider key from the `ANTHROPIC_API_KEY` environment variable (the SDK's standard source; never in the repository, never shown or logged), the model id and the price table (defaults for `claude-opus-5-5`: $4 input, $20 output, $0.20 cache read per million tokens, plus the cache-write price from the provider's price list, checked in `implement`), and the scorer's concurrency (default 1). Without a key the feature runs in its AC-14 state ("not scored", reason shown); nothing else breaks. Deployment checklist gains: set the key, and set a spending limit in the provider account as the backstop for a leaked key (spec §6.1).

**Monitoring:**
- Scoring health on SCR-02 is the monitor: last success, spend this month against the cap, pending count and the oldest pending age, could-not-be-scored count, current problem; a provider or key problem raises the main-screen marker (AC-14), a reached cap its own line above the list (AC-12).
- Server logs, structured, `module=matching`: one line per attempt with posting id, outcome, tokens and cost — never CV text, profile, prompt bodies or the key (§8).
- Alert by the marker for the scoring-health problems in CONTEXT other than a reached cap: provider unreachable, key refused or missing. A reached cap alerts by its own line above the list (flow 9; review R6, R28). The oldest pending age is shown as a figure in scoring health, not as a marker trigger.

**Scaling thresholds:**
- One attempt at a time keeps the 15-minute freshness target up to about 200 new postings an hour entering the list (a scoring takes seconds); above that, raise the scorer's concurrency to 2–3.
- `matching_scores` holds at most one row per open posting (10,000 in the search NFR); `matching_spend` grows by one row per attempt — about 1,500–3,000 a month — comfortable in SQLite for years; trimming rows older than 12 months is optional housekeeping.

## 8. Crosscutting concepts

| Concept | Convention | Where defined |
|---|---|---|
| Access | Loopback only, same-origin, JSON body on every state-changing request; applies unchanged to profile, CV draft, cap and notice actions (AC-17) | `core/access.ts`, collector ADR-0007 |
| CV upload transport | The file travels base64-encoded inside a JSON body; that one route raises its body limit to 7 MB (5 MB file plus encoding); the web checks kind and size before sending, and a body-too-large error on that route is answered with the AC-08 message ("what is wrong and which kinds of file work"), not the generic one; no multipart, so the JSON rule above stays the CSRF guard | here |
| Error handling | Expected failures throw `AppError(code, message, status)`; one envelope `{ "error": { "code", "message" } }` | `core/errors.ts`, `CLAUDE.md` |
| Provider errors | Classified by the SDK's typed errors: rate limit, overloaded, connection and timeout → provider problem (pending, retried, AC-14); authentication or permission → key problem (retried after a restart); validation failure or `refusal` stop reason → unusable answer, a strike (AC-18). The SDK's own retries are off (`maxRetries: 0`), so every attempt passes through a spend reservation (ADR-0006) | here |
| Logging | Structured, `module=matching`; never log CV text, profile fields, prompt or answer bodies, or the key; log posting id, outcome, tokens, cost | here, Fastify logger |
| Secrets | Provider key only from `ANTHROPIC_API_KEY`; never stored in the database, shown on screen, put in an error message or logged | here, spec §6.1 |
| Untrusted text | Posting text and model output are data: the fit note and quoted claims render as plain text, claims as "the posting says…" (AC-03); posting text enters prompts only inside a delimited data block | search AC-09, ADR-0008 |
| Personal data | CV text never stored; contact details removed before sending (AC-09) and rejected on save (AC-16); profile holds no name or contact detail; nothing sent before the one-time notice is agreed (AC-20) | ADR-0007, spec §6.1 |
| ID strategy | UUIDv7 from `core/id.ts` for spend rows; scores keyed by posting id | `CLAUDE.md` |
| Time | Calendar month in the machine's time zone (`machineTimeZone()` in `core/config.ts`), as the grace day | `core/config.ts` |
| Internationalisation | N/A — single language (English UI) | — |
| Observability | Scoring health (SCR-02) plus logs; no tracing | §7 |

## 9. Architecture decisions

<!-- 🎯 Why: the REVERSE INDEX onto the adr/ folder. `ls adr/` gives the files; §9 gives the
     semantics — why they exist, which SAD section they attach to, what status.
     📋 Write: a 4-column table, one row per ADR. Mixed status is fine.
     📌 e.g. «0001 | Store content as a table of typed blocks | Accepted | §4». -->

| # | Title | Status | Section |
|---|---|---|---|
| 0001 | Ship match score as a new matching module plus a profile screen and card additions | Accepted | §4 |
| 0002 | Score with Claude Opus 5.5 at low effort | Accepted | §4 |
| 0003 | Score one posting at a time with the Messages API in a background scorer | Accepted | §4 |
| 0004 | Read scores into search through an injected reader and read the list from search | Accepted | §4 |
| 0005 | Keep one score per posting with text and profile fingerprints | Accepted | §4 |
| 0006 | Reserve the largest possible cost before each attempt and settle from usage | Accepted | §4 |
| 0007 | Extract CV text locally and send only text | Accepted | §4 |
| 0008 | Constrain model output to part scores and compute the total in job-radar | Accepted | §4 |

ADR files live under `docs/features/match-score/adr/NNNN-<title>.md`.

## 10. Quality requirements

Each quality goal from §1 expanded into a full scenario; numbers from spec §6 verbatim.

**QG-1. A score never costs the owner a posting**
- **When:** the owner's list is built with scores present, low scores included, in either order.
- **Then:** "0 postings left out of the list or its counts because of their score" (spec §6 Never a hide by score); every posting without a score carries its reason (pending, not scored — provider or key problem, cap reached, could not be scored; no profile once for the list).
- **How verify:** property test in `apps/server/test/`: for generated collections and score sets, the list with and without scores holds the same postings and the same total, hidden, "new" and marked counts; a stand-in `ScoreReader` returns every score state.

**QG-2. Spending stays within the owner's cap**
- **When:** scoring and a CV draft run against a cap with little left, including charged failures and two attempts reserving at once.
- **Then:** "the month's scoring and profile drafting never exceed the scoring cap (default $5); 0 attempts started after the cap is reached" (spec §6 Spending).
- **How verify:** unit tests of the cap rule and the reserve-and-settle ledger (ADR-0006) with a stand-in provider that answers, fails after charging, times out and refuses; scoring health shows the month's spend.

**QG-3. Personal data leaves only as agreed**
- **When:** the owner uploads a CV full of contact details, then scoring runs; or anything would be sent before the notice is agreed.
- **Then:** "0 scorings carry a name, email, phone number, address or profile link" (spec §6 No personal details sent); nothing is sent before the one-time notice is agreed (AC-20).
- **How verify:** unit tests over what the stand-in provider receives for the draft and for scorings, with a CV holding an email, phone, address and links; an integration test that a draft or scoring before agreement sends nothing.

**QG-4. The list stays fast and scores arrive fresh**
- **When:** the list loads with 10,000 open postings, scores and a profile, in either order; postings enter the list at up to 50 an hour; a CV of up to 5 MB is uploaded.
- **Then:** "≤ 1 s p95 to the first 50 postings shown, with 10,000 open postings, scores and a profile — unchanged from search, in either order" (spec §6 Search response with scores); "a posting with no score that enters the owner's list is scored within 15 minutes p95, also while stale scores are being redone" (spec §6 Scoring freshness); "the draft profile is shown ≤ 60 s p95 after a CV upload of up to 5 MB" (spec §6 Draft profile time).
- **How verify:** the existing `search-nfr` integration test rerun with scores and best match first; an integration test with a stand-in provider feeding 50 postings an hour during a re-score, asserting the oldest pending age; an integration test of the draft path with a 5 MB file and a stand-in provider.

**QG-5. Scores are stable and resist planted wording**
- **When:** the same posting is scored repeatedly against the same profile; postings carry wording addressed to the scorer or location phrases in their description.
- **Then:** "the same posting scored twice against the same profile differs by ≤ 10 points in 95% of cases" (spec §6 Score stability); over five scorings of each version, the median with planted wording is no more than 10 points above the median without it (AC-03), and a description location phrase moves the median by no more than 10 points (AC-05).
- **How verify:** an evaluation run with the real model over a fixed set of postings and one profile — run by hand before `ship` and after any change to the prompt, the output schema or the model, not in the regular gate (it costs about $1–2 a run on Opus 5.5). The regular gate stays free and deterministic with a stand-in provider.

## 11. Risks and technical debt

| Risk / debt | Severity | Mitigation | Owner |
|---|---|---|---|
| Product: at the $5 default, Opus 5.5 covers about 270 scorings — roughly one to two weeks of the owner's stream (ADR-0002) | Medium | The cap-reached line says so and when scoring resumes (AC-12); the owner raises the cap (AC-19, about $15–30 for the full stream); measure the real cost per scoring in `implement` and, if needed, switch the model by configuration after a Score stability run | Volodymyr Kozlov |
| Planted wording in posting text still moves the part scores | Medium | Fixed output schema, total computed in job-radar, posting text in a delimited data block, claims shown as the posting's words (ADR-0008); AC-03 evaluation run before `ship` | Volodymyr Kozlov (Security Lead) |
| Scores bunch in a narrow band and the applied-vs-skipped KPI is missed | Medium | Review the KPI at 30 days (spec §7); calibrate the instructions and part definitions; re-run the evaluation set after each change | Volodymyr Kozlov |
| The stored price drifts from the provider's price list, so job-radar's spend count understates the bill | Low | Price table is configuration; set a spending limit in the provider account (spec §6.1, §7 deployment checklist) | Volodymyr Kozlov |
| Two new dependencies for reading PDF and Word files | Low | Pick small, maintained libraries in `tasks`; they only read local files; pin versions | Volodymyr Kozlov |
| Brownfield: `docs/architecture-map.md` is stale (reflects 133499e, about 200 commits behind) | Low | Run `/sdd:survey` to refresh it after this feature ships | Volodymyr Kozlov |
| Spec §8 Q1 open: should the profile's core skills also bring postings into the list | Low | Default stays: typed skills alone decide the list; decide by 2026-10-31 | Volodymyr Kozlov |

**Accepted debt (acceptable in v1, plan to fix later):**
- Only the current score per posting is kept; no history of earlier scores.
- The scorer runs one attempt at a time; raise concurrency if the stream exceeds about 200 postings an hour (§7).
- Postings that newly enter the list after switching the filter off, widening skills or starting a one-off look show "pending" until scored in their turn (AC-13).

## 12. Glossary

| Term | Meaning |
|---|---|
| Owner | The one person who runs job-radar on their own machine (CONTEXT). |
| Visitor | Anyone who can reach the machine over a network but is not the owner (CONTEXT). |
| Match score | How well one posting fits the owner's profile: 0–100 with parts for skills, seniority, role type and terms, plus a fit note; orders the list, never hides; a posting without one shows why (CONTEXT). |
| Profile | The owner's short, editable description of what they look for, used only to score; never holds a name or contact detail (CONTEXT). |
| Scoring cap | The most job-radar may spend on scoring and drafting in one calendar month of the owner's time zone; $0 pauses scoring (CONTEXT). |
| Scoring health | Scoring's owner-visible state beside source health: last success, spend against the cap, pending, could not be scored, current problem (CONTEXT). |
| Skill | A word the owner types to narrow the list; decides which postings are in it (CONTEXT). NOT the profile's skills, which only score. |
| Location verdict | The remote filter's fits / check / not open decision; a score never changes it (CONTEXT, spec AC-05). |
| Updated posting | A posting whose text, location, link or listings changed (CONTEXT); a change to the scored text makes its score stale. |
| Fit note | The at-most-40-word plain-text note on a score: why it fits and what is missing; claims from the posting appear as "the posting says…". |
| Stale score | A score made against an earlier version of the posting's scored text or of the profile (text fingerprint or profile version differs); shown with its mark until replaced. |
| Strike | One unusable answer for a posting; three in a row make it "could not be scored" until the posting or profile changes (spec AC-18). |
| Reservation | A spend-ledger row holding an attempt's largest possible cost before it starts; settled to the real cost from usage, or kept if no answer came (ADR-0006). |
| Owner's list | Unmarked open postings that match the typed skills and are shown by the remote filter — what search lists and what matching scores (ADR-0004). |
