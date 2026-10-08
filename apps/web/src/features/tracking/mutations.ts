// Marks on SCR-01 (applied-skipped sad §4): TanStack mutations; a card changes only after the server
// confirms the save (AC-14), never optimistically. Pages are never refetched: each card's latest
// confirmed state is kept here. The main list hides a marked card, so Undo puts it back at its earlier
// place (AC-03); the marked view shows the new state in place (AC-05, AC-06).
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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

export function useMarks() {
  const [states, setStates] = useState<ReadonlyMap<string, MarkState>>(new Map());
  /** Removed by clean-up since the list loaded (AC-15): the card leaves. */
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<{ postingId: string; choice: Choice } | null>(null);
  /** Per card: a save that failed, with the choice Retry repeats (AC-14). */
  const [failed, setFailed] = useState<ReadonlyMap<string, { message: string; choice: Choice }>>(new Map());
  const setFailure = (postingId: string, failure?: { message: string; choice: Choice }) =>
    setFailed((f) => {
      const next = new Map(f);
      if (failure) next.set(postingId, failure);
      else next.delete(postingId);
      return next;
    });
  const confirm = (state: MarkState) => setStates((m) => new Map(m).set(state.posting_id, state));
  const marking = useMutation({
    mutationFn: ({ postingId, choice }: { postingId: string; choice: Choice }) => setMark(postingId, choice),
  });
  const undoing = useMutation({
    mutationFn: ({ postingId, changeId }: { postingId: string; changeId: string }) =>
      undoMark(postingId, changeId),
  });

  const mark = (postingId: string, choice: Choice) => {
    setPending({ postingId, choice });
    marking.mutate(
      { postingId, choice },
      {
        onSuccess: (state) => {
          setFailure(postingId);
          confirm(state);
          // A new notice replaces the old one: Undo covers only the latest change (AC-03).
          setNotice({ kind: "marked", postingId, mark: state.mark, changeId: state.change_id as string });
        },
        onError: (err) => {
          if (isGone(err)) {
            // Removed by clean-up since the list loaded: it leaves, nothing recorded (AC-15).
            setFailure(postingId);
            setGone((g) => new Set(g).add(postingId));
            setNotice({ kind: "gone" });
          } else setFailure(postingId, { message: err.message, choice });
        },
        onSettled: () => setPending(null),
      },
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
    gone,
    /** Main list: left out once removed, or marked in this window (AC-01, AC-12). */
    hiddenFromMain: (postingId: string) =>
      gone.has(postingId) || (states.get(postingId)?.mark ?? null) !== null,
    failed,
    notice,
    pending,
    undoPending: undoing.isPending,
    mark,
    undo,
    closeNotice: () => setNotice(null),
    /** A new list: its cards carry their own states, and the notice closes (AC-03). */
    reset: () => {
      setStates(new Map());
      setGone(new Set());
      setFailed(new Map());
      setNotice(null);
    },
  };
}
