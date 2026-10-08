// Marks on SCR-01 (applied-skipped sad §4): TanStack mutations; a card leaves only after the server
// confirms the save (AC-14), never optimistically. The list's pages are never refetched — a marked
// card is hidden, so Undo puts it back at its earlier place in the pages already shown (AC-03).
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../../api/collector";
import type { Mark } from "../../api/search";
import { setMark, undoMark } from "../../api/tracking";
import type { Choice } from "./MarkActions";

export type Notice =
  /** `error`: the Undo failed to save (AC-14); the notice stays with Retry. */
  | { kind: "marked"; postingId: string; mark: Mark | null; changeId: string; error?: string }
  | { kind: "refused"; message: string }
  | { kind: "gone" };

const isGone = (err: unknown) => err instanceof ApiError && err.code === "TRACKING_POSTING_NOT_FOUND";

export function useMarks() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
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
  const hide = (postingId: string) => setHidden((h) => new Set(h).add(postingId));
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
          hide(postingId);
          // A new notice replaces the old one: Undo covers only the latest change (AC-03).
          setNotice({ kind: "marked", postingId, mark: state.mark, changeId: state.change_id as string });
        },
        onError: (err) => {
          if (isGone(err)) {
            // Removed by clean-up since the list loaded: it leaves, nothing recorded (AC-15).
            setFailure(postingId);
            hide(postingId);
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
        onSuccess: () => {
          setHidden((h) => {
            const next = new Set(h);
            next.delete(postingId);
            return next;
          });
          setNotice(null);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "TRACKING_MARK_CHANGED_ELSEWHERE")
            setNotice({ kind: "refused", message: err.message });
          else if (isGone(err)) setNotice({ kind: "gone" });
          else setNotice({ ...notice, error: err.message });
        },
      },
    );
  };

  return {
    hidden,
    failed,
    notice,
    pending,
    undoPending: undoing.isPending,
    mark,
    undo,
    closeNotice: () => setNotice(null),
    /** A new list: nothing is hidden from it, and the notice closes (AC-03). */
    reset: () => {
      setHidden(new Set());
      setFailed(new Map());
      setNotice(null);
    },
  };
}
