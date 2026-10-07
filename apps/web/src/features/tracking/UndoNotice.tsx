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
export const noticeKey = (n: Notice) => (n.kind === "marked" ? n.changeId : `refused:${n.message}`);

/** The notice after a mark (AC-03): sticky at the bottom, 8 s, replaced by the next one (render it
 * with `key={noticeKey(notice)}`). Re-renders of the screen never extend the 8 s. */
export function UndoNotice({ notice, onUndo, onClose, onShowMarked, undoPending = false }: UndoNoticeProps) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const timer = setTimeout(() => close.current(), UNDO_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div data-testid="undo-notice" className="sticky bottom-0 py-2">
      {notice.kind === "marked" ? (
        <InlineBanner
          tone="info"
          title={notice.mark === null ? "Mark cleared" : TEXT[notice.mark]}
          action={{ label: "Undo", onClick: undoPending ? () => {} : onUndo }}
        />
      ) : (
        <InlineBanner
          tone="info"
          title={notice.message}
          action={onShowMarked && { label: "Show marked postings", onClick: onShowMarked }}
        />
      )}
    </div>
  );
}
