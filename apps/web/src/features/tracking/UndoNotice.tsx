import { useEffect, useRef } from "react";
import { InlineBanner } from "../../components/InlineBanner";
import type { Notice } from "./mutations";

export const UNDO_MS = 8_000;

interface UndoNoticeProps {
  notice: Notice;
  onUndo: () => void;
  onClose: () => void;
  onShowMarked?: () => void;
  undoPending?: boolean;
}

const TEXT = { applied: "Marked applied", skipped: "Marked skipped" } as const;

/** A key per notice, so the next one remounts the notice and restarts its 8 s. */
export const noticeKey = (n: Notice) =>
  n.kind === "marked"
    ? `${n.changeId}:${n.error ?? ""}`
    : n.kind === "refused"
      ? `refused:${n.message}`
      : "gone";

/** The notice after a mark (AC-03): sticky at the bottom, 8 s, replaced by the next one (render it
 * with `key={noticeKey(notice)}`). Re-renders of the screen never extend the 8 s. */
export function UndoNotice({ notice, onUndo, onClose, onShowMarked, undoPending = false }: UndoNoticeProps) {
  const close = useRef(onClose);
  close.current = onClose;
  // A failed Undo stays until Retry succeeds or the usual triggers close it (screens.md save error);
  // an Undo in flight keeps it until the answer arrives (screens.md undo pending).
  const timed = !(notice.kind === "marked" && notice.error !== undefined) && !undoPending;
  useEffect(() => {
    if (!timed) return;
    const timer = setTimeout(() => close.current(), UNDO_MS);
    return () => clearTimeout(timer);
  }, [timed]);
  // Each notice is a new element (its key). When the card the owner acted on left the list or changed
  // its buttons, focus fell to <body>: it moves to the notice's action, or to the notice itself when
  // it has none (gone). A slow answer never pulls focus from where the owner has moved on to.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (lost) (box.current?.querySelector("button") ?? box.current)?.focus();
  }, []);

  return (
    <div ref={box} tabIndex={-1} data-testid="undo-notice" className="sticky bottom-0 py-2 outline-none">
      {notice.kind === "marked" && notice.error !== undefined && (
        // A failed Undo: the notice keeps its place and offers Retry (AC-14).
        <InlineBanner tone="error" title="Couldn't undo your mark." onRetry={onUndo}>
          {notice.error}
        </InlineBanner>
      )}
      {notice.kind === "marked" && notice.error === undefined && (
        <InlineBanner
          tone="info"
          title={notice.mark === null ? "Mark cleared" : TEXT[notice.mark]}
          action={{ label: "Undo", onClick: onUndo, disabled: undoPending }}
        />
      )}
      {notice.kind === "refused" && (
        <InlineBanner
          tone="info"
          title={notice.message}
          action={onShowMarked && { label: "Show marked postings", onClick: onShowMarked }}
        />
      )}
      {notice.kind === "gone" && <InlineBanner tone="info" title="This posting is no longer in job-radar." />}
    </div>
  );
}
