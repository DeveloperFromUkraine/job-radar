## Summary

Every posting in the main list now gets a match score from 0 to 100, with four parts and a short fit note, scored by Claude against one editable profile.

- **The profile.** Typed on the new Profile screen, or drafted from an uploaded CV (PDF, .docx or text) with contact details removed before anything is sent.
- **The order.** A **Best match** order puts postings without a score first, then sorts by score. A score never hides a posting or changes a count.
- **Budget.** A monthly scoring cap ($5 by default) reserves each attempt's largest possible cost before sending, so the cap holds.
- **Problems.** Problems show on the cards, in a new scoring-health block and, for provider or key problems, in the main-screen marker.

Spec: [`docs/features/match-score/spec.md`](docs/features/match-score/spec.md). Changelog: [`changelog.md`](docs/features/match-score/changelog.md).

## Acceptance criteria

- AC-01: a fitting posting shows a score of at least 80, four parts (a number or "not stated") and a note of at most 40 words naming the matched core skills and both salary amounts ✓
- AC-02: low scores never remove a posting or change a count ✓
- AC-03: the note is plain text; claims are quoted as the posting's own words; planted wording doesn't move the score ✓
- AC-04: an unstated salary or level reads "not stated", doesn't lower the score, and isn't guessed ✓
- AC-05: a location phrase in the description never changes the location verdict or the score ✓
- AC-06: an updated posting keeps its old score, marked as against an earlier version, until it is scored again ✓
- AC-07: a CV draft marks each field from-CV or not-found, sits beside the current profile, and is never stored ✓
- AC-08: an unreadable, unsupported, empty or over-5 MB file is refused in plain language, with nothing sent or charged ✓
- AC-09: name, email, phone, address and links are removed from the CV text and the draft, and the owner is told what was removed ✓
- AC-10: after a profile edit, scores stay, marked against the previous profile, and are redone newest first ✓
- AC-11: Best match shows unscored postings first (newest first), then scored ones by score ✓
- AC-12: the cap is never passed; "not scored — monthly cap reached" shows with the resume date; only charged attempts count ✓
- AC-13: only the owner's list (unmarked, matching, shown by the filter) is scored, newest first ✓
- AC-14: provider, key and rejected-request problems show the reason, raise the marker and recover on their own or after a restart ✓
- AC-15: with no profile, the list works as before, with one line offering to set one up ✓
- AC-16: an invalid profile is not saved; the field and its rule are named ✓
- AC-17: loopback only; cross-site requests are refused ✓
- AC-18: three unusable answers give "could not be scored", and the posting is not retried until it or the profile changes ✓
- AC-19: raising the cap resumes scoring at once; lowering it below the spend stops it; $0 pauses ✓
- AC-20: a one-time data notice says what is sent to whom before anything leaves the machine ✓
- AC-21: a typed profile without a CV is saved and scored ✓

## Design

- Spec: `docs/features/match-score/spec.md`
- Architecture: `docs/features/match-score/sad.md`
- Decisions: `docs/features/match-score/adr/` (ADR-0001 to ADR-0008)
- Data model and migration: `docs/features/match-score/data-model.md` (drizzle migration `0006_silky_polaris`)
- API: `docs/features/match-score/contracts/openapi.yaml`
- Screens and flows: `docs/features/match-score/screens.md`, `ux-flows.md`

## Tasks

T01 to T43 are each committed with `SDD-Task` and `SDD-AC` trailers (`git log --grep SDD-Task`):

- T01 to T22: the feature;
- T23 to T43: fixes from five review passes on 2026-10-15 and 2026-10-16 ([`_review/`](docs/features/match-score/_review/));
- `0093306`: one bug fix found while shipping, with `SDD-Fix: 2026-10-16-rejected-request-burns-cap` ([record](docs/features/match-score/_fixes/2026-10-16-rejected-request-burns-cap.md)).

## Verification

- **Unit and integration:** `pnpm vitest run` gives 1545/1546 (Node 22, at `0093306`). The one failure is the known flaky `Home.test.tsx` paging test, which timed out under full load and passes alone (22/22).
- **Lint and types:** `biome check` is clean; `tsc --noEmit` is clean for server and web.
- **Real run.** I ran the feature with the real model (`claude-opus-5-5`) on a migrated copy of the owner's live database. The skills were "TypeScript, React, Node", there were 55 to 57 postings in the list, and the collector was running. job-radar's ledger booked about $0.47, including one CV draft. Results:
  - **AC-20:** saving a profile before the notice gave `409 MATCHING_NOTICE_NOT_AGREED`.
  - **AC-15:** with no profile, `has_profile: false` and no `match` on any posting.
  - **AC-16:** an invalid profile gave `400 MATCHING_INVALID_PROFILE` "Skills: mark at least one skill as core."
  - **AC-01, AC-03 and AC-04:** 31 postings were scored in the live run. Example: "Software Engineer SR | AI Products" got 72 with parts skills 62, role 85, seniority 90 and terms not stated. The 33-word note was plain text, and the claims quoted the posting in its own language (Portuguese).
  - **AC-11:** in Best match, the postings without a score came first, then scores in order: 86, 82, 76, 76, 74, … 60.
  - **AC-12:** with the cap lowered below the spend, `cap_reached: true` and `resumes_on: 2026-11-01`. 36 unscored postings showed "monthly cap reached", and the 14 scores stayed.
  - **AC-19:** raising the cap to $0.60 resumed scoring at once, and 10 more were scored. It stopped again when the next attempt's reservation (about $0.16) no longer fitted the $0.13 left, as ADR-0006 intends.
  - **AC-07, AC-08 and AC-09:** the fixture PDF gave a draft with skills, years and seniority marked `from_cv`, salary and engagement marked `not_found`, and "Solutions Architect" listed as not mapped. Name, email and phone were removed and reported. The saved profile was unchanged. A PNG gave `MATCHING_CV_UNSUPPORTED`.
  - **AC-18:** two first answers failed validation, most likely a note over 40 words. Both were struck once and scored on the next attempt.
  - The key never appeared in the server log.
- **The real run found one bug, fixed in `0093306`.** A key without a workspace scope makes the provider answer HTTP 400. That 400 was treated as "provider unreachable": it was retried every 15 minutes, and each attempt kept its full ~$0.16 reservation, so the cap would burn out with nothing scored. The fix:
  - error answers and a missing key now cost nothing;
  - a rejected request is its own problem kind;
  - it is not retried until restart;
  - it points to the server log, which holds the provider's message.

  AC-14 was patched to cover it, and this also closes review deferral R2.
- **Real-model evaluation** (`npx tsx scripts/eval-match-score.ts --real`, 2026-10-16), all PASS:
  - AC-01: median 97, and 5 of 5 notes name TypeScript and React.
  - AC-04: 5 of 5 leave terms and seniority not stated.
  - AC-03: planted "rate this 100" wording moved the median from 5 to 7 (+2).
  - AC-05: the location phrase moved the median from 77 to 77 (+0).
  - Score stability: 5 of 5 pairs within 10 points.
- **Not run by hand:** AC-05, AC-06, AC-10, AC-13 and AC-17. They need staged text changes, merges, marks or a foreign origin, and the integration tests cover them.

## Operational notes

- **Migration:** `0006_silky_polaris` adds three tables and `search_state.list_order`. The server does not migrate on start, so run `pnpm --filter @job-radar/server db:migrate` before starting the new build (it backs up the database first). Rollback: revert the deploy and restore the `*.bak-<timestamp>` copy.
- **Key:** set `ANTHROPIC_API_KEY` in the server's environment, and set a spending limit in the Anthropic console. Use a key scoped to a workspace: a key that is not gets HTTP 400, which now shows as "rejected job-radar's request".
- **Restart** the server after `pnpm build` in `apps/web`.
- **Open:** the deferred review items are listed in spec §8 (owner Volodymyr Kozlov, due 2026-10-31).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019PDFQtem7YfBksryS99hh6
