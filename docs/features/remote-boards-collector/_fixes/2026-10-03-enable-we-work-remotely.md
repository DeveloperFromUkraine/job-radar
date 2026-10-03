---
slug: remote-boards-collector
date: 2026-10-03
triage: gap
acs: [AC-21, AC-22, AC-27]
commit: e9c2fb4
recurrence_of: none
---

# Fix: We Work Remotely is never collected, even when the owner enables it

## Symptom

When the owner enables We Work Remotely in `settings.json`, the expected result is that WWR postings are collected. Instead it shows as "not verified" and sends no request, and the defaults leave it disabled. This affected every install since the feature was built: spec §8 Q1 was deferred because WWR's terms, API and RSS pages all answered 403 on 2026-10-02.

## Root cause

This was an open question in the spec, not a code defect. With §8 Q1 unanswered, the design gave WWR an allowed rate of 0 (`domain/sources.ts`) and a stub adapter that never sends a request (`infra/sources/weworkremotely.ts`). On 2026-10-03 the RSS page https://weworkremotely.com/remote-job-rss-feed was read in a browser, because it sits behind a Cloudflare challenge. It says anyone may use the public feed as long as links point back to WWR. The feed itself answers 200 to the collector's User-Agent. It publishes no rate limit, and its `<ttl>` is 60 minutes. Each item carries `guid`, `link`, "Company: Role" titles, `pubDate`, `expires_at`, `<category>`, `<region>` and `<country>`. The all-jobs feed holds only about the newest 10 items per category (89 items), so it is capped. In 60 of 89 items `<region>` reads "Anywhere in the World" with an empty `<country>`, and 18 items pair it with a US-only `<country>`, so that region value does not mean "anywhere".

The change:
- A real RSS adapter that reads one request a run and returns a capped result, so absence never closes a posting. `expires_at` is the close signal (`closesByExpiry`), since it moves forward when a posting is renewed. The location is `<country>`, else a specific `<region>`, else unknown.
- `SourceHttp.getText`: `getJson` now sits on top of it, so the ledger, limits, timeout and size cap are shared.
- Registry: WWR is read every hour (≤ 1 per hour) and its published category list is recorded.
- WWR is enabled by default with four tech categories.

## The pinning test

`test/collector-adapters.integration.test.ts` → "We Work Remotely" (integration, against the anonymised recorded feed `test/fixtures/sources/weworkremotely/latest.rss`):
- "reads the public feed in one request, capped, with company and title split". RED: `AssertionError: expected [] to deeply equal [ '/remote-jobs.rss' ]` (the stub sent nothing).
- "takes the location from <country>, else a specific <region>, else states nothing (AC-21, AC-22)"
- "fails a response that is not an RSS feed". RED: `expected { completeness: 'partial', …(3) } to match object { completeness: 'failed', …(1) }`.

The e2e 7-day simulation now also asserts WWR at exactly 7 × 24 reads, inside its limit. Gate: 333/333, biome and tsc clean on server and web.

Live run on 2026-10-03 against a fresh database: WWR was enabled by default, its outcome was `capped`, and it added 27 postings. Two of its items were the same Collibra role posted twice, 8 s apart, and they were shown as one posting (AC-04). 21 of 27 have an unknown location. Next due was +1 h. No flags.

## Spec patch

The triage is a **gap**: §8 Q1 was open, so no AC described the collected behaviour. No new AC was needed, because AC-01 to AC-27 already cover a fourth source. The answer was written into the existing text, confirmed by the owner on 2026-10-03:
- **§8 Q1:** `[ ]` → `[x]`, answered with the RSS page, the rate and the location rule.
- **§8 Q2:** "We Work Remotely — none, ages out only" → "`expires_at` passed (… absence never closes; added by fix 2026-10-03)".
- **AC-27:**
  - "every source except We Work Remotely enabled" → "every source enabled".
  - The zero-rate clause becomes "(none in v1 since 2026-10-03)".
- **§6:**
  - Rate: "We Work Remotely 0 — not read until §8 Q1" → "≤ 1 per hour".
  - Intervals: WWR 1 h added.
  - Freshness: WWR counts as hourly-allowed (≤ 5 h).
- **§1:** the committed approach and the traceability line now say WWR is read hourly from its public feed.
- **ADR-0004:** the WWR row now shows a capped completeness and `expires_at` as its close signal.
- **sad.md:** WWR is no longer described as disabled (§2 constraints, the C4 context, the §11 risk row).
- **Roadmap:** the step 2 wording is updated to match.

## Follow-ups

- The `not_verified` source state (server, web badge, contract) is now reachable only by a future zero-rate source. Its unit tests use a synthetic definition, and the integration test that used WWR for it was removed. Delete the state if no unverified source is planned.
- `screens.md` wireframes still use WWR as the example of the "Disabled" and "Not verified" cards. They remain valid as state examples, but the source name is stale.
- Location text from WWR keeps the flag emoji (e.g. "🇺🇸 United States of America"), exactly as stated (AC-21). The remote filter (roadmap step 5) has to handle them.
- If a large share of fresh WWR tech postings is missed (the all-jobs feed caps at about 10 per category), read the per-category feeds instead, at one request each inside the hourly budget.
