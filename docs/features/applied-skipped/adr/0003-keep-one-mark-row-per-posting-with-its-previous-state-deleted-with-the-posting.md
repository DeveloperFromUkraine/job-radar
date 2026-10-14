---
status: Accepted
owner: "Volodymyr Kozlov"
reviewers: []
updated_at: "2026-10-07"
feature_size: "S"
ticket: ""
---

# 0003 — Keep one mark row per posting with its previous state, deleted with the posting

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Volodymyr Kozlov, with Claude during the design pass

## Context

A posting has at most one mark, and the mark survives merging, closing, reopening and restarts (AC-08). Undo returns a posting to exactly its earlier state, including the previous mark's original date (AC-03), but only when nothing has changed the mark since, from any window (AC-04). The spec now has clean-up remove a skipped posting like an unmarked one and keep only applied postings (AC-09), with a grace day after applied protection is lost (AC-07). Collector ADR-0006 planned a marks table that references the posting with delete restricted, so the database would refuse to remove any marked posting; with skips removable, that restriction would block clean-up.

## Decision drivers

- AC-03 / AC-04: one undo level, exact previous state, refused after any later change.
- AC-07 / AC-09: only applied postings (and those in their grace day) are protected from clean-up.
- AC-15: marking a posting clean-up already removed records nothing.
- Spec §6 Durability: a mark is confirmed only once saved; spec §7: the app keeps no history of marks.
- Collector ADR-0006: the collector consults a port and removes nothing that day if the port fails.

## Considered options

1. **One row per posting with its previous state; the row is deleted with the posting.** `tracking_marks` holds, per posting, the current mark (applied, skipped, or none once cleared) and when it was set, the previous mark and its date, and a change id (UUIDv7) replaced on every change. Undo sends the change id it was given and is applied only if that id is still current. The row references the posting with on-delete cascade. The collector's port answers which postings are protected: applied ones, plus those that lost applied until the end of the next calendar day.
2. **The same row, plus a database trigger that refuses deleting a posting with an applied mark.** Keeps ADR-0006's database-level backstop for applied postings.
**Excluded by constraint (not weighed):**
- *An append-only log of mark changes* — spec §7 states the app keeps no history of marks.

## Decision outcome

**Chosen:** Option 1. It is the smallest shape that meets AC-03, AC-04, AC-07 and AC-09: the previous state on the row makes undo exact, and the change id makes a stale undo fail even when the mark went "back to the same mark". The cascade lets clean-up remove skipped and cleared postings without tracking's help, and a write for a removed posting fails on the reference, which is AC-15. Option 2's trigger would live in tracking's migration but fire on the collector's table — a hidden coupling — and a refused delete would fail the whole clean-up batch.

This **partly supersedes collector ADR-0006**: the port and the "nothing removed when the port fails" rule stay; the delete-restricted reference becomes on-delete cascade, and the port's meaning narrows from "marked" to "protected" (applied, or in its grace day).

## Consequences

**Positive**
- One row, one read per posting; undo and the stale-undo check are one guarded update.
- Clean-up removes skipped and cleared postings with no change to its code beyond the port's name.

**Negative**
- Applied postings are protected by the port alone; a bug in the port's answer could let clean-up remove one. The port's fail-safe (remove nothing on error) and an AC-09 integration test are the guard.
- Only one undo level (spec §8 open question, default kept).

**Neutral**
- A cleared row stays until its posting is removed; that is what lets the marked view show "Cleared, removed after <date>" (AC-05, AC-07).
- Moving to a history log later means a data migration of every row.

## Links

- Spec: [[../spec.md]] AC-03, AC-04, AC-07, AC-08, AC-09, AC-14, AC-15
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: collector [ADR-0006](../../remote-boards-collector/adr/0006-keep-owner-marks-behind-a-port-the-collector-consults-before-removal.md) (partly superseded), [[0001-ship-marks-as-new-tracking-module-plus-main-screen-actions]]
