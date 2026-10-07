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
  | { kind: "marked"; postingId: string; mark: Mark | null; changeId: string }
  | { kind: "refused"; message: string };

export function useMarks() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<{ postingId: string; choice: Choice } | null>(null);
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
          setHidden((h) => new Set(h).add(postingId));
          // A new notice replaces the old one: Undo covers only the latest change (AC-03).
          setNotice({ kind: "marked", postingId, mark: state.mark, changeId: state.change_id as string });
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
        },
      },
    );
  };

  return {
    hidden,
    notice,
    pending,
    undoPending: undoing.isPending,
    mark,
    undo,
    closeNotice: () => setNotice(null),
    /** A new list: nothing is hidden from it, and the notice closes (AC-03). */
    reset: () => {
      setHidden(new Set());
      setNotice(null);
    },
  };
}
