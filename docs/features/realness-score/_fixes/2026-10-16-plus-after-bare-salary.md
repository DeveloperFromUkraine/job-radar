---
slug: realness-score
date: 2026-10-16
triage: regression
acs: [AC-06]
commit: 9d93dc6
recurrence_of: none
---

# Fix: a bare salary followed by "plus" reads as no salary

## Symptom

Text with "Salary: 45,000 plus benefits" should count as stating pay (AC-06). Instead it read as no salary, so the posting was wrongly lowered with "no salary listed". The same happens with "Base salary 95,000 plus equity", "Salary: 70,000 Plus bonus" and "Compensation: 120,000 plus stock options".

It affects every posting whose only pay statement is a bare amount (no currency, no range) after a pay word, followed by "plus". It arrived with R11 (`9f35b3f`) on the unmerged PR #8, and was recorded as residual 1 in [review 6](../_review/review-2026-10-16-6.md) and spec §8.

## Root cause

R11 made a bare amount after a pay word stop being pay when the next word is a counted plural, so that "10,000 requests" is not a salary. The plural test was `/^\p{L}+s$/u` (`pay.ts`, the `bareAmount` next-word check). "plus" ends in "s", so it counted as a plural.

The R11 probes covered qualifiers ("DOE", "negotiable", "basic plus commission"), but no bare amount directly followed by "plus".

## The pinning test

The test is `pay.test.ts`, "the review probes … every one decided right". It is a unit test over `PAY_PROBES` (`pay-probes.ts`), with a new group "A bare salary, then plus".

The RED run on `32c1386` failed 4 probes with:

> `AssertionError: expected false to be true // Object.is equality`

The four were `text "Salary: 45,000 plus benefits" → true`, "Base salary 95,000 plus equity", "Salary: 70,000 Plus bonus" and "Compensation: 120,000 plus stock options". All pass after the fix.

Guard pins in the same change hold the verdicts that must not move:

- "SALARY: 75,000 EUROS" → pay;
- "SALARY: 60,000 DOLLARS" → pay;
- "Rate limit of 10,000 requests plus bursts" → not pay;
- "Salary data from 5,000 companies plus surveys" → not pay.

The labelled set and probes have 0 misses in 228 before the guards are added.

## The fix shape

Spec §8 named `!/^(?!plus$)\p{L}+s$/iu.test(nextWord)`. Probing the inputs next to it showed that its `i` flag also makes upper-case plurals count. "SALARY: 75,000 EUROS" and "SALARY: 60,000 DOLLARS" would then newly read as no salary, which is the harmful direction (spec §1).

The owner chose the case-preserving variant instead: `!/^\p{L}+s$/u.test(nextWord) || /^plus$/i.test(nextWord)`. It changes only "plus", in any casing.

## Spec patch

None to the ACs. This is a regression, and AC-06 was right ("the title or description … gives an amount of money as pay"). AC-06 was re-checked against the new probes. The §8 open question for this fix is checked off and links this record.

## Follow-ups

These were found while probing. They are not folded in: they need no fix round of their own and go to the §8 hand check (due 2026-11-30).

- "Base salary 95,000 bonus eligible" reads as no salary. "bonus" is singular but ends in "s", the same shape as "plus". This was the behaviour before this fix too, and it is harmful but plausible.
- "RATE LIMIT OF 10,000 REQUESTS" reads as pay. Upper-case plurals don't count. This is harmless (it only avoids a lowering) and was the behaviour before this fix.
