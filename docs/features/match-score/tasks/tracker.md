# Tracker — match-score

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | Promote the staged schema: the three matching tables and search_state.list_order | migration | Volodymyr Kozlov | S | — | done |
| T02 | Write the profile rules: fixed lists, field checks, contact detection, change detection and salary periods | domain | Volodymyr Kozlov | M | — | done |
| T03 | Write the score rules: total with fixed weights, answer validation, text fingerprint, staleness and the match state | domain | Volodymyr Kozlov | M | — | done |
| T04 | Write the spend rules: largest possible cost, settled cost from usage, month boundary and cents rounding | domain | Volodymyr Kozlov | S | — | done |
| T05 | Write matching's repo: settings singleton, scores, and the spend ledger with reserve-in-one-transaction | infra | Volodymyr Kozlov | M | T01, T04 | done |
| T06 | Add the Claude client: SDK, configuration, fixed output schemas, usage, error classes and a stand-in provider | infra | Volodymyr Kozlov | M | T02, T03 | done |
| T07 | Extract CV text locally from PDF, Word (.docx) and plain text, with the AC-08 refusals | infra | Volodymyr Kozlov | M | — | done |
| T08 | Implement the settings use cases: read settings, save profile, agree to the notice, set the cap | app | Volodymyr Kozlov | M | T02, T05 | done |
| T09 | Implement the CV draft use case: extract, remove contacts, reserve, ask, map to the fixed lists, drop the CV | app | Volodymyr Kozlov | M | T02, T04, T05, T06, T07 | done |
| T10 | Give search a ScoreReader, the best-match order and a match on every posting | app | Volodymyr Kozlov | L | T01 | done |
| T11 | Export the owner's list from search and show the last score in the marked view | app | Volodymyr Kozlov | S | T10 | done |
| T12 | Implement matching's score reader and scoring health | app | Volodymyr Kozlov | M | T03, T05, T10, T11 | done |
| T13 | Implement one scoring attempt: reserve, ask, validate, store or strike, settle | app | Volodymyr Kozlov | M | T03, T04, T05, T06 | done |
| T14 | Run the background scorer: polling, wake-ups, queue order, retry cadence, start and stop | app | Volodymyr Kozlov | M | T11, T13 | done |
| T15 | Expose matching's routes and wire the module into app.ts | ports | Volodymyr Kozlov | M | T08, T09, T12, T14 | done |
| T16 | Show the match on every card: API types, ScoreBadge and MatchSummary in the main list and the marked view | ui | Volodymyr Kozlov | M | — | done |
| T17 | Add the order switch, the no-profile and cap-reached line, and scoring problems in the marker | ui | Volodymyr Kozlov | M | T16 | done |
| T18 | Add the scoring health card to the source health screen | ui | Volodymyr Kozlov | S | T16 | done |
| T19 | Build the profile screen: route, AppNav link, ProfileForm, DataNotice and CapField | ui | Volodymyr Kozlov | L | T16 | done |
| T20 | Add CV upload and the draft review to the profile screen | ui | Volodymyr Kozlov | M | T19 | done |
| T21 | Prove the invariants and NFRs end to end, and add the real-model evaluation run | tests | Volodymyr Kozlov | M | T15, T17 | done |
| T22 | Update the docs: SAD table names and flow 2, contract pointers, design-system inventory, roadmap and key setup | docs | Volodymyr Kozlov | S | T21 | done |
| T23 | Review fix R1: the cap counts as reached once an attempt's reservation is refused this month | app | Volodymyr Kozlov | S | T22 | done |
| T24 | Review fixes R8, R10, R11: retry wakes at 15 minutes, provider calls abort on stop with their own timeout, pass errors are logged and reservations settle | app | Volodymyr Kozlov | S | T23 | done |
| T25 | Review fixes R14, R7: case-insensitive fence, the note names both salary amounts, eval checks AC-01 and AC-04 | infra | Volodymyr Kozlov | S | T24 | done |
| T26 | Review fix R15: a corrupt zip, a docx with no document part and an inflate bomb are refused as unsupported | test | Volodymyr Kozlov | S | T25 | done |
| T27 | Review fix R9: the domain owns profile validation, so every profile error answers MATCHING_INVALID_PROFILE with the field message | ports | Volodymyr Kozlov | S | T26 | done |
| T28 | Review fixes R6, R16: no problem marker for cap_reached; the cap field shows the saved cap | ui | Volodymyr Kozlov | S | T27 | done |
| T29 | Review fixes R5, R17: the draft sits beside the current profile from md with a source tag on each field; the CV data notice shows under the upload | ui | Volodymyr Kozlov | S | T28 | done |
| T30 | Review fixes R21, R22: profile type and duplicate errors answer MATCHING_INVALID_PROFILE; skill length and count are checked before the contact scan | ports | Volodymyr Kozlov | S | T29 | done |
| T31 | Review fix R23: a successful reservation clears the refused-cap record, and each pass retries the reservation for the current head of the queue | app | Volodymyr Kozlov | S | T30 | done |
| T32 | Review fix R24: the fence also escapes whitespace between < and /, and zero-width characters | infra | Volodymyr Kozlov | S | T31 | done |
| T33 | Review fix R27: the cap field keeps its 'Saved' message after the cap changes | ui | Volodymyr Kozlov | S | T32 | done |
| T34 | Review fixes R29, R30: two columns only when there is a current profile; on phones 'Show current profile' sits below the draft | ui | Volodymyr Kozlov | S | T33 | done |
| T35 | Review fix R28: openapi and sad.md say the problem marker shows when there is a problem other than a reached cap | docs | Volodymyr Kozlov | S | T34 | done |
| T36 | Review fix R37: sad.md, CONTEXT and openapi say a reached cap has its own line, and which wrong types get VALIDATION_ERROR | docs | Volodymyr Kozlov | S | T35 | done |
| T37 | Review fix R33: skill names are trimmed before they are checked and stored | domain | Volodymyr Kozlov | S | T36 | done |
| T38 | Review fix R35: cap reached clears when the queue is empty and money is left | app | Volodymyr Kozlov | S | T37 | done |
| T39 | Review fix R32: the web profile rules check in the server's order and refuse duplicates, from one shared table | ui | Volodymyr Kozlov | S | T38 | done |
| T40 | Review fix R36: Spent this month follows the settings, not the value at mount | ui | Volodymyr Kozlov | S | T39 | done |
| T41 | Review fix R40: openapi says how scalars are converted and which bodies still get VALIDATION_ERROR | docs | Volodymyr Kozlov | S | T40 | todo |
| T42 | Review fix R39: the web refuses a postal address in a skill, from a shared table case | ui | Volodymyr Kozlov | S | T41 | todo |
| T43 | Review fix R41: a CV draft refreshes the settings and scoring health | ui | Volodymyr Kozlov | S | T42 | todo |

**Total:** 43 tasks, ~25 person-days (T23–T29 from review 2026-10-15; T30–T35 from re-review 2026-10-15; T36–T40 from review 2026-10-16; T41–T43 from re-review 2026-10-16).
