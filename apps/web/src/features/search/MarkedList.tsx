import { useState } from "react";
import type { MarkedPosting, MarkedResult } from "../../api/search";
import { Button } from "../../components/Button";
import { InlineBanner } from "../../components/InlineBanner";
import type { Choice } from "../tracking/MarkActions";
import { MarkActions } from "../tracking/MarkActions";
import type { useMarks } from "../tracking/mutations";
import { PostingCard } from "./PostingCard";

interface MarkedListProps {
  result: MarkedResult;
  postings: MarkedPosting[];
  marks: ReturnType<typeof useMarks>;
  hasNext: boolean;
  loadingMore: boolean;
  moreError?: string | undefined;
  onShowMore: () => void;
}

/** SCR-01 marked view (AC-05 – AC-07): newest first, closed and cleared postings included; a card
 * keeps its place when its mark changes, until the view loads again. */
export function MarkedList({
  result,
  postings,
  marks,
  hasNext,
  loadingMore,
  moreError,
  onShowMore,
}: MarkedListProps) {
  const [confirming, setConfirming] = useState<{ postingId: string; choice: Choice } | null>(null);

  if (result.marked_count === 0 && result.cleared_count === 0) {
    return (
      <p>
        {result.skills.length === 0
          ? "No marked postings."
          : `No marked postings match ${result.skills.join(", ")}.`}
      </p>
    );
  }

  const summary =
    result.cleared_count > 0
      ? `${result.marked_count} marked and ${result.cleared_count} cleared`
      : `${result.marked_count} marked`;
  return (
    <section className="flex flex-col gap-3" aria-label="Marked postings">
      <p className="text-text-muted">{summary}</p>
      <ul className="flex flex-col gap-3">
        {postings
          .filter((p) => !marks.gone.has(p.id))
          .map((p) => {
            const state = marks.states.get(p.id) ?? p.mark_state;
            const failure = marks.failed.get(p.id);
            const choose = (choice: Choice) => {
              // AC-07: losing applied on a posting past the 60-day rule asks first.
              if (state.mark === "applied" && state.at_risk && choice !== "applied")
                setConfirming({ postingId: p.id, choice });
              else marks.mark(p.id, choice);
            };
            const asking = confirming?.postingId === p.id ? confirming : null;
            return (
              <li key={p.id}>
                <PostingCard
                  posting={{ ...p, mark_state: state }}
                  banner={
                    failure && (
                      <InlineBanner
                        tone="error"
                        title="Couldn't save your mark."
                        onRetry={() => marks.mark(p.id, failure.choice)}
                      >
                        {failure.message}
                      </InlineBanner>
                    )
                  }
                  actions={
                    <MarkActions
                      title={p.title}
                      mark={state.mark}
                      pending={marks.pending?.postingId === p.id ? marks.pending.choice : undefined}
                      onChoose={choose}
                      confirm={
                        asking
                          ? {
                              onContinue: () => {
                                setConfirming(null);
                                marks.mark(p.id, asking.choice);
                              },
                              onCancel: () => setConfirming(null),
                            }
                          : undefined
                      }
                    />
                  }
                />
              </li>
            );
          })}
      </ul>
      {moreError !== undefined ? (
        <InlineBanner tone="error" title="Couldn't load more postings." onRetry={onShowMore}>
          {moreError}
        </InlineBanner>
      ) : (
        hasNext && (
          <Button pending={loadingMore} onClick={onShowMore}>
            Show 50 more
          </Button>
        )
      )}
    </section>
  );
}
