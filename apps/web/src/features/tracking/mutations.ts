// Marks on SCR-01 (applied-skipped sad §4): a card changes only after the server
// confirms the save (AC-14), never optimistically. Pages are never refetched: each card's latest
// confirmed state is kept here. The main list hides a marked card, so Undo puts it back at its earlier
// place (AC-03); the marked view shows the new state in place (AC-05, AC-06).
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError } from "../../api/collector";
import type { Mark, MarkState } from "../../api/search";
import { setMark, undoMark } from "../../api/tracking";
import type { Choice } from "./MarkActions";

export type Notice =
  /** `error`: the Undo failed to save (AC-14); the notice stays with Retry. */
  | { kind: "marked"; postingId: string; mark: Mark | null; changeId: string; error?: string }
  | { kind: "refused"; message: string }
  | { kind: "gone" };

const isGone = (err: unknown) => err instanceof ApiError && err.code === "TRACKING_POSTING_NOT_FOUND";

/** Cards carry their own states, so this window's confirmed states only cover changes since a list
 * loaded. `listKey`, the main list's snapshot: `states` (hiding and counts) reset only when a new main
 * list arrives, never while a kept list is still on screen (AC-12). `viewKey`, the marked view's
 * snapshot: `viewStates` reset with each new one, so the view shows the server's current mark (AC-04). */
export function useMarks(listKey: string | undefined, viewKey: string | undefined) {
  const [states, setStates] = useState<ReadonlyMap<string, MarkState>>(new Map());
  const [viewStates, setViewStates] = useState<ReadonlyMap<string, MarkState>>(new Map());
  /** Removed by clean-up since the list loaded (AC-15): the card leaves. */
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  /** Per card: the choice whose save is in flight. Each call handles its own answer (AC-01, AC-14). */
  const [pending, setPending] = useState<ReadonlyMap<string, Choice>>(new Map());
  /** Per card: a save that failed, with the choice Retry repeats (AC-14). */
  const [failed, setFailed] = useState<ReadonlyMap<string, { message: string; choice: Choice }>>(new Map());
  const setFailure = (postingId: string, failure?: { message: string; choice: Choice }) =>
    setFailed((f) => {
      const next = new Map(f);
      if (failure) next.set(postingId, failure);
      else next.delete(postingId);
      return next;
    });
  const confirm = (state: MarkState) => {
    setStates((m) => new Map(m).set(state.posting_id, state));
    setViewStates((m) => new Map(m).set(state.posting_id, state));
  };
  /** After Undo, focus goes back to the restored card (PostingCard's id). */
  const [focusCard, setFocusCard] = useState<string | null>(null);
  useEffect(() => {
    if (focusCard === null) return;
    document.getElementById(`posting-${focusCard}`)?.querySelector("button")?.focus();
    setFocusCard(null);
  }, [focusCard]);
  const [shownKey, setShownKey] = useState(listKey);
  if (shownKey !== listKey) {
    setShownKey(listKey);
    setStates(new Map());
    setGone(new Set());
    setFailed(new Map());
    setPending(new Map());
  }
  const [shownViewKey, setShownViewKey] = useState(viewKey);
  if (shownViewKey !== viewKey) {
    setShownViewKey(viewKey);
    setViewStates(new Map());
  }
  const undoing = useMutation({
    mutationFn: ({ postingId, changeId }: { postingId: string; changeId: string }) =>
      undoMark(postingId, changeId),
  });

  // A plain call per click, not one shared mutation: a second card marked before the first answers
  // must not drop the first card's answer.
  const mark = (postingId: string, choice: Choice) => {
    setPending((p) => new Map(p).set(postingId, choice));
    setMark(postingId, choice)
      .then(
        (state) => {
          setFailure(postingId);
          confirm(state);
          // A new notice replaces the old one: Undo covers only the latest change (AC-03). No row
          // (clearing a mark another window already undid) means nothing to undo, so no notice.
          setNotice(
            state.change_id === null
              ? null
              : { kind: "marked", postingId, mark: state.mark, changeId: state.change_id },
          );
        },
        (err: Error) => {
          if (isGone(err)) {
            // Removed by clean-up since the list loaded: it leaves, nothing recorded (AC-15).
            setFailure(postingId);
            setGone((g) => new Set(g).add(postingId));
            setNotice({ kind: "gone" });
          } else setFailure(postingId, { message: err.message, choice });
        },
      )
      .finally(() =>
        setPending((p) => {
          const next = new Map(p);
          next.delete(postingId);
          return next;
        }),
      );
  };

  const undo = () => {
    if (notice?.kind !== "marked") return;
    const { postingId, changeId } = notice;
    undoing.mutate(
      { postingId, changeId },
      {
        onSuccess: (state) => {
          confirm(state);
          setNotice(null);
          setFocusCard(postingId);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "TRACKING_MARK_CHANGED_ELSEWHERE")
            setNotice({ kind: "refused", message: err.message });
          else if (isGone(err)) {
            setGone((g) => new Set(g).add(postingId));
            setNotice({ kind: "gone" });
          } else setNotice({ ...notice, error: err.message });
        },
      },
    );
  };

  return {
    states,
    viewStates,
    gone,
    /** Main list: left out once removed, or marked in this window (AC-01, AC-12). */
    hiddenFromMain: (postingId: string) =>
      gone.has(postingId) || (states.get(postingId)?.mark ?? null) !== null,
    failed,
    notice,
    pendingFor: (postingId: string) => pending.get(postingId),
    undoPending: undoing.isPending,
    mark,
    undo,
    /** Also on a search or the switch, before the new list arrives (AC-03). */
    closeNotice: () => setNotice(null),
  };
}
