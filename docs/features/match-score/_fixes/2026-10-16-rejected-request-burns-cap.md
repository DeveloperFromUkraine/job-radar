---
slug: match-score
date: 2026-10-16
triage: regression
acs: [AC-12, AC-14]
commit: 0093306
recurrence_of: none
---

# Fix: a request the provider rejects burns the scoring cap every 15 minutes and reads as "can't be reached"

## Symptom

Found during the ship's live run on 2026-10-16, with a real key against a copy of the owner's database. The key had been created without a workspace scope, so the provider answered every score request with HTTP 400 (`invalid_request_error`: "This API key is not scoped to a workspace…").

- **Expected:** the attempt costs nothing, because the provider charged nothing. The owner sees a reason they can act on, and the request is not retried on its own.
- **Got:** each attempt kept its full reservation (about $0.16) as spend. Scoring health said "The language-model provider can't be reached right now. Scoring tries again by itself." The scorer retried every 15 minutes, so a $5 cap would be gone in about 8 hours with no score made, and scoring would stay stopped for the rest of the month after the key was fixed.

This affects every install whose key or account setup the provider rejects. It has been there since the matching module shipped on this branch.

## Root cause

There were two causes:

- **`classify()` in `apps/server/src/modules/matching/infra/claude.ts`** mapped any non-401/403/429 `APIError` (400, 404, …) to `provider_unreachable`. A `ponytail:` note accepted this "until it shows up in the logs".
- **`repo.markNoAnswer()`** kept every no-answer attempt at its reserved maximum, including error answers the provider never charges for. That broke AC-12 ("counting failed attempts the provider charged for").

The tests missed both because they use the stand-in provider. The classification test even pinned `400 → provider_unreachable`, and the attempt and draft tests pinned "the reservation stays as spent" for `rate_limited`, `key_refused` and `key_missing`.

## The pinning test

The tests are integration and unit tests. The RED run's assertions, all GOOD red:

- `matching-scorer.integration.test.ts` › "after request_rejected, never retries until restart and says what to fix" — `AssertionError: expected [ 'x', 'x' ] to have a length of 1 but got 2`
- `matching-attempt.integration.test.ts` › "rate_limited / key_refused / key_missing / request_rejected: settles at 0" — `expected [ { …(13) } ] to deeply equal [ ObjectContaining{…} ]` (`settledUsdMicros` was `null`, the reserved maximum)
- `claude.test.ts` › "classifies 400 invalid_request_error as request_rejected, not charged" and its 401/403/429/500/529/404 rows — `expected { kind: 'problem', …(2) } to match object { kind: 'problem', …(2) }`
- `claude.test.ts` › "keeps the provider's own message for the log" — `to match object { detail: StringContaining{…} }`
- `matching-cv-draft.integration.test.ts`: the same booking rule for drafts.
- `matching-repo.integration.test.ts` › "an attempt the provider did not charge for settles at zero" was added with the fix.

The fix:

- A provider problem now carries `charged`. Only a problem with no HTTP answer (connection lost, timeout, abort) is `charged: true` and keeps its reservation, as ADR-0006 requires. Every error answer and a missing key settle at zero.
- A 4xx other than 401, 403 and 429 is the new `request_rejected` kind, with the provider's message in the log line. Like a key problem, it is not retried until restart, and its reason points to the server log.
- The draft route answers `MATCHING_KEY_PROBLEM`, with a message that now covers a rejected request.

## Spec patch

The triage is a regression for AC-12: its wording was right and the code broke it. AC-14 had a gap, now filled. The owner confirmed the patch on 2026-10-16, and both changes carry `<!-- added-by-fix: 2026-10-16 -->`.

- **AC-14 Given**, before: "the provider is unreachable, refuses job-radar's key, or no key is set up". After: "… refuses job-radar's key, rejects job-radar's request (for example a key not scoped to a workspace), or no key is set up".
- **AC-14 Then**, the end, before: "after a missing or refused key, it is tried again when job-radar is restarted with a key". After: "after a missing or refused key or a rejected request, it is tried again when job-radar is restarted; the reason for a rejected request points to the server log, which holds the provider's message".
- **AC-14 note**, added: "An attempt the provider answered with an error, or that was never sent, costs nothing (AC-12); only an attempt with no answer at all (a timeout, a lost connection) counts, at its largest possible cost."
- Spec §8 **R2** (no key still books the full cost) is closed by the same change.
- The openapi `ScoringProblem.kind` enum gains `request_rejected`. The web type follows.

## Follow-ups

- Health shows the kind and a fixed reason. The provider's own message is only in the server log, because storing it would need a column. Add one if pointing to the log proves too indirect.
- The live check with a workspace-scoped key is still due in this ship run.
