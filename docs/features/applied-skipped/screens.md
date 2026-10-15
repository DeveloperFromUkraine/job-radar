---
status: draft
feature_size: "S"
tool: code
updated_at: "2026-10-07"
---

# Screens — applied-skipped

> The canonical **screen manifest**: every screen in every state. `screens` produces it between `api` and `tasks`. `tasks` cites its SCR ids and states, `implement` builds to it, and `review` checks against it. Downstream reads only this manifest.

## Source

- **Tool:** code (from `docs/design-system.md`). No design-tool MCP is used.
- **File:** the wireframes are inline below. They show the 360 px phone layout. From `md:` the card keeps search-postings' second column (time and sources on the right), and the mark actions stay at the bottom of the card.

States are derived from:
- spec §5 AC-01 – AC-15 (AC-08, AC-09 and AC-16 have no screen: collector events, clean-up and the access rule)
- sad.md §6 flows 1–5 (`alt`/`else` branches)
- `contracts/openapi.yaml` responses
- the ux-flows US-01 – US-07 branches

Owner decisions recorded at this stage (2026-10-07):
- **Undo covers the latest change only.** Spec §8's question is closed with its default, and AC-03 stands as written.
- **Search while the marked view is on** reloads the marked view with the new skills (`runMarkedView`), and the switch stays on (AC-05: skills narrow the view as they narrow the main list). It closes the Undo notice like any search (AC-03).

## Screens

### SCR-01 — Main screen

This is the search-postings main screen with the mark actions on every card, the Undo notice, the look-alike hint, the "nothing left to review" state and the "Show marked postings" switch. Every search-postings SCR-01 state (loading, validation, error, show more, list expired, waiting, problem) is unchanged unless a row below restates it.

Component tree: App shell › ProblemMarker (when flagged) › SkillsField › MarkedToggle › summary line › waiting notice › PostingCard list (each with MarkActions) › show-more › Undo notice (sticky at the bottom of the viewport).

#### Main list (switch off)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | `runSearch` 200 with `total > 0`. The summary counts unmarked postings only ("128 postings · 2 new"). Each card ends with Applied and Skipped (AC-01, AC-02, AC-12) | App shell, SkillsField, NEW: MarkedToggle (off), PostingCard ×≤50 with NEW: MarkActions, Button "Show 50 more" | wireframe 01-a |
| look-alike | An item has `look_alike` set (AC-10). One line on the card above the actions: "You applied to a similar posting at Acme Inc on 3 Oct" or "You skipped a similar posting at … on …", using `look_alike.company` and `marked_at`. Plain text, no action. The card stays in the list and its counts (AC-11) | PostingCard (look-alike line, extended) | wireframe 01-a |
| marking | `setMark` in flight. The pressed button is pending, both are disabled, and the card stays where it is. It never leaves before the 200 (AC-14, sad.md §4) | MarkActions (pending) | — |
| marked | `setMark` 200 (AC-01, AC-02). The card leaves the list, the count drops by one (and "· N new" too if the card was new), and the notice "Marked applied" / "Marked skipped" with Undo shows for 8 s. It closes sooner on the next mark, search, switch or reload (AC-03). A new notice replaces the old one, and Undo covers only the latest change | InlineBanner (info, action "Undo"), sticky at the bottom | wireframe 01-b |
| undo pending | `undoMark` in flight. The Undo action is disabled and the notice stays until the answer arrives | InlineBanner (info) | — |
| undone | `undoMark` 200 (AC-03). The card returns to its earlier place in the pages already shown, with its New badge if it had one, the counts are restored, and the notice closes | PostingCard | as 01-a |
| undo refused | `undoMark` 409 `TRACKING_MARK_CHANGED_ELSEWHERE` (AC-04). Nothing reverted. The notice changes to the API message with the action "Show marked postings", which turns the switch on | InlineBanner (info, action "Show marked postings") | wireframe 01-b |
| save error | `setMark` / `undoMark` 503 `TRACKING_MARKS_UNAVAILABLE` or 500 (AC-14). The card keeps its earlier state, and the banner sits in the card above the actions with the API message and Retry, which repeats the same call. For a failed Undo, the banner replaces the notice's text, and the notice stays until Retry succeeds or the owner dismisses it by the usual triggers | InlineBanner (error, Retry) | wireframe 01-c |
| posting gone | `setMark` / `undoMark` 404 `TRACKING_POSTING_NOT_FOUND` (AC-15). The card leaves without a mark being recorded, the count drops by one, and the notice says "This posting is no longer in job-radar." with no Undo | InlineBanner (info), sticky at the bottom | wireframe 01-b |
| nothing left to review | `runSearch` 200 with `total: 0` and `marked_count > 0` (AC-13). "Nothing left to review. You've marked 3 matching postings." with one action, "Show marked postings", which turns the switch on | Button "Show marked postings" | wireframe 01-d |
| empty: nothing matches / collection empty | `total: 0` with `marked_count: 0`. Search-postings' messages are unchanged (AC-13) | as search-postings 01-d / 01-d′ | search 01-d |
| marked elsewhere | Marks set or cleared in another window. Cards and counts on screen stay until refresh or search. The next page leaves out postings marked since loading and includes postings cleared since (AC-12). There is no visual of its own | — | — |
| waiting | `getWaitingCount` 200; the count is unmarked only (AC-12). Otherwise unchanged | InlineBanner (info, action "Refresh") | search 01-e |
| error / show more / list expired | Unchanged from search-postings. A 503 now also covers marks that cannot be read (contract F-4) | InlineBanner | search 01-c, 01-e |

#### Marked view (switch on)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | The owner turns the switch on, or searches with it on. `runMarkedView` is in flight | NEW: MarkedToggle (on), SkeletonRow ×3 | as search 01-b |
| default | `runMarkedView` 200 (AC-05). The summary reads "12 marked and 1 cleared"; "and N cleared" only when `cleared_count > 0`. Cards are most recently marked first. Each card shows a mark Badge ("Applied" / "Skipped") with "on 3 Oct" from `mark_state.marked_at`, and MarkActions offering a change of mark plus Clear | MarkedToggle (on), PostingCard (marked variant, extended) ×≤50, MarkActions (marked), Badge (tone `notice` for Applied, `disabled` for Skipped) | wireframe 01-e |
| closed card | `status: closed` (AC-05). Badge "Closed" (tone `disabled`). Every source is named, with a link only for a listing still open (contract `Listing.url`) | PostingCard (marked), Badge | wireframe 01-e |
| cleared card | `mark_state.mark: null` on a closed posting (AC-05, AC-07). Badge "Cleared" with the line "Removed after 8 Oct" from `removed_after`, or just "Cleared" when `removed_after` is null (every source of the posting disabled, so its age is frozen and there is no removal date; re-review 2026-10-14 R14), and the actions Applied / Skipped (no Clear) | PostingCard (marked), Badge (tone `disabled`), MarkActions | wireframe 01-e |
| at-risk confirm | The owner presses Clear or Skipped on an applied card with `mark_state.at_risk: true` (AC-07, flow 4 `opt`). Before any call, the card's actions turn into the warning "Without the applied mark, this posting will be removed at clean-up." and two buttons, Continue and Cancel. Cancel restores the actions with nothing sent; Continue sends `setMark` | MarkActions (confirm) | wireframe 01-f |
| changing | `setMark` in flight | MarkActions (pending) | — |
| changed | `setMark` 200 with a mark (AC-06). The card stays in place with the new Badge and date, and the notice "Marked skipped" / "Marked applied" with Undo shows | PostingCard (marked), InlineBanner (info, action "Undo") | as 01-b |
| cleared open | `setMark` 200 with `mark: null` on an open posting (AC-06). The card stays until reload with "Not marked" and Applied / Skipped, and the notice "Mark cleared" with Undo shows. Back in the main list, the posting is in its date position and is New only by the visit rule | PostingCard (marked), MarkActions, InlineBanner (info, action "Undo") | — |
| cleared closed | `setMark` 200 with `mark: null` on a closed posting (AC-07). The card turns into *cleared card* in place, with the notice and Undo | as cleared card | wireframe 01-e |
| undo / undo refused / save error / posting gone | The same answers as in the main list (AC-03, AC-04, AC-14, AC-15). Undone restores the card's earlier Badge and date in place. A gone card leaves the view | as main list | as 01-b, 01-c |
| empty | `runMarkedView` 200 with `marked_count: 0` and `cleared_count: 0` (contract). "No marked postings." or "No marked postings match Go."; turning the switch off is the way back | MarkedToggle (on) | — |
| error | `runMarkedView` / `getNextMarkedPage` 503 / 500. As main-list error, with Retry repeating the call | InlineBanner (error, Retry) | as search 01-c |
| show more | `getNextMarkedPage`: pending / error / done, as in the main list. The order is fixed when the view loaded, with no repeats or gaps | Button "Show 50 more", InlineBanner | — |
| view expired | `getNextMarkedPage` 410 `SEARCH_SNAPSHOT_EXPIRED`. The view re-runs `runMarkedView` and says "This list had expired and was reloaded." | InlineBanner (info) | — |
| validation | Search with the switch on and `SEARCH_INVALID_SKILLS` (400). As search-postings validation, and the view on screen stays | SkillsField (error) | search 01-c |
| switch off | The owner turns the switch off. The notice closes and the main list reloads (`runSearch` with the field's skills). The switch is off again on every visit (AC-05) | MarkedToggle (off) | as 01-a |

#### NEW: MarkActions

| State | Trigger | Look |
|---|---|---|
| unmarked | main list, or a cleared / "Not marked" card | Two Buttons, "Applied" and "Skipped", side by side in a two-column grid with `gap-2` (8 px), each at least 44 px tall, at the bottom of the card |
| marked | marked-view card with a mark | The other mark plus "Clear": "Skipped" + "Clear" on an applied card, "Applied" + "Clear" on a skipped card |
| pending | a call in flight | The pressed Button is pending and the other is disabled |
| confirm | at-risk change (AC-07) | Warning text in `text-text` with a `border-danger` frame like InlineBanner `warning`, then "Continue" and "Cancel" in the same two-column grid |

Each action's accessible name includes the posting title ("Mark Senior Backend Engineer applied"), so repeated buttons are distinguishable for screen readers.

#### NEW: MarkedToggle

A labelled switch, "Show marked postings", placed under SkillsField: a native `<input type="checkbox" role="switch">` inside a 44 px tall label. It is off on every visit and never remembered (AC-05). Turning it on runs `runMarkedView`; turning it off runs `runSearch`. Both use the skills field's text. It is disabled while either call is in flight.

#### Extended: PostingCard

| Part | Rule | Source |
|---|---|---|
| Look-alike line | Main list only, when `look_alike` is set. `text-sm text-text-muted`, plain text: "You applied to a similar posting at <company> on <d Mon>" / "You skipped …" | AC-10, AC-11 |
| Marked variant | Marked view: there is no New badge. The title row carries the mark Badge and, when closed, "Closed". The mark line reads "Applied on 3 Oct" / "Skipped on 1 Oct" / "Cleared · removed after 8 Oct" / "Cleared" (no date while the age is frozen) / "Not marked" | AC-05, AC-06, AC-07 |
| Actions slot | MarkActions at the bottom of the card, full card width on phones | design-system touch & reach, spec §6 Phone layout |

The 360 px layout has no horizontal scroll. Long titles and company names wrap, as in search-postings (spec §6 Phone layout).

```text
wireframe 01-a — main list, default with a look-alike (360 px)
+--------------------------------------+
| job-radar        Home  Source health |  AppNav
|--------------------------------------|
| Your skills                          |  SkillsField
| [Go, TypeScript                    ] |
| [            Search                ] |
| [ ○ ] Show marked postings           |  MarkedToggle (off)
|                                      |
| 128 postings · 2 new                 |  unmarked only
| +----------------------------------+ |
| | Senior Backend Engineer    (New) | |  PostingCard
| | ACME                             | |
| | Published 1 d ago                | |
| | (Go)                             | |
| | Jobicy — Worldwide           ↗   | |
| | You applied to a similar posting | |  look-alike line
| | at Acme Inc on 3 Oct             | |
| | [  Applied   ]  [  Skipped   ]   | |  MarkActions, 8 px gap
| +----------------------------------+ |
| +----------------------------------+ |
| | Full-stack Developer (Node.js)   | |
| | …                                | |
| | [  Applied   ]  [  Skipped   ]   | |
| +----------------------------------+ |
|  …                                   |
| [         Show 50 more             ] |
+--------------------------------------+
```

```text
wireframe 01-b — notices, sticky at the bottom of the viewport
+--------------------------------------+
| …list…                               |
| ┌──────────────────────────────────┐ |
| │ Marked applied           [ Undo ]│ |  marked (8 s)
| └──────────────────────────────────┘ |
+--------------------------------------+
  undo refused:  │ This mark was changed elsewhere, so it was not undone.
                 │ See the marked postings for its current mark.
                 │                        [ Show marked postings ]
  posting gone:  │ This posting is no longer in job-radar.     (no action)
```

```text
wireframe 01-c — save error inside the card
+----------------------------------+
| Senior Backend Engineer          |
| …                                |
| ┌──────────────────────────────┐ |
| │ Couldn't save your mark.     │ |  InlineBanner error
| │ Job-radar could not save your│ |
| │ mark just now. Try again.    │ |
| │                    [ Retry ] │ |
| └──────────────────────────────┘ |
| [  Applied   ]  [  Skipped   ]   |  earlier state kept
+----------------------------------+
```

```text
wireframe 01-d — nothing left to review (AC-13)
+--------------------------------------+
| Your skills                          |
| [Haskell                           ] |
| [            Search                ] |
| [ ○ ] Show marked postings           |
|                                      |
| Nothing left to review. You've       |
| marked 3 matching postings.          |
| [      Show marked postings        ] |
+--------------------------------------+
```

```text
wireframe 01-e — marked view: applied, closed + skipped, cleared
+--------------------------------------+
| [ ● ] Show marked postings           |  MarkedToggle (on)
|                                      |
| 12 marked and 1 cleared              |
| +----------------------------------+ |
| | Sr. Backend Engineer (Go) –      | |
| | Remote                (Applied)  | |  Badge notice
| | Acme Inc                         | |
| | Applied on 3 Oct                 | |
| | Himalayas — Europe               | |
| | [  Skipped   ]  [   Clear    ]   | |
| +----------------------------------+ |
| +----------------------------------+ |
| | Frontend Engineer                | |
| |        (Skipped) (Closed)        | |  Badge disabled ×2
| | Example Co                       | |
| | Skipped on 1 Oct                 | |
| | Remotive — Worldwide             | |
| |   closed at Remotive             | |  no link
| | [  Applied   ]  [   Clear    ]   | |
| +----------------------------------+ |
| +----------------------------------+ |
| | Data Engineer   (Cleared)        | |
| |                 (Closed)         | |
| | Example Co                       | |
| | Removed after 8 Oct              | |
| | [  Applied   ]  [  Skipped   ]   | |
| +----------------------------------+ |
+--------------------------------------+
```

```text
wireframe 01-f — at-risk confirm, in place of the actions (AC-07)
+----------------------------------+
| Sr. Backend Engineer (Go) …      |
| Applied on 3 Oct                 |
| ┌──────────────────────────────┐ |
| │ Without the applied mark,    │ |  border-danger
| │ this posting will be removed │ |
| │ at clean-up.                 │ |
| └──────────────────────────────┘ |
| [  Continue  ]  [   Cancel   ]   |
+----------------------------------+
```

### SCR-02 — Source health

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default, loading, empty, error, … | N/A: unchanged by this feature (collector screens.md SCR-02) | SourceCard, RunProgress, CollectNowAction, InlineBanner, SkeletonRow | collector 02-a – 02-g |

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| MarkActions | Button is a single action. The applied and skipped pair needs a fixed 8 px two-column layout, a marked variant (change + Clear), a shared pending state, and the AC-07 confirm sub-state with Continue and Cancel, which InlineBanner's single action can't hold. It composes Button | pending |
| MarkedToggle | The inventory has no switch or checkbox primitive. It is a native checkbox with `role="switch"` and a 44 px label | pending |

**Extended and reused primitives.** These are additive props that don't change existing call sites; `implement` updates the inventory rows.

| Primitive | Extension | Why |
|---|---|---|
| PostingCard | A look-alike line (main list), a marked variant (mark Badge, Closed, mark line) and an actions slot | AC-05, AC-07, AC-10 |
| InlineBanner | No change. The Undo notice reuses tone `info` with `action: { label: "Undo" }`, in a sticky bottom wrapper owned by SearchList | AC-03 |
| Badge | No change. Applied uses tone `notice`; Skipped, Closed and Cleared use `disabled` | AC-05 |
