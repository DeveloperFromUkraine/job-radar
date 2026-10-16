import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Country } from "../../api/remoteFilter";
import type { Posting, SearchResult } from "../../api/search";
import { Button } from "../../components/Button";
import { InlineBanner } from "../../components/InlineBanner";
import { PostingCard } from "./PostingCard";

interface SearchListProps {
  /** The snapshot's first page (totals) and every posting shown so far. */
  result: SearchResult;
  postings: Posting[];
  /** null on the very first visit: nothing is new, so no new count (AC-14). */
  previousVisitStartedAt: string | null;
  onClearSkills: () => void;
  /** Matching postings collected after the list loaded (AC-16); 0 or unknown shows nothing. */
  waiting?: number;
  onRefresh: () => void;
  /** Show more (AC-15): the next page, its pending state, and its failure (AC-12). */
  hasNext: boolean;
  loadingMore: boolean;
  moreError?: string;
  onShowMore: () => void;
  /** MarkActions for a card (applied-skipped). */
  actionsFor?: (posting: Posting) => ReactNode;
  /** A failed save on a card, above its actions (AC-14). */
  bannerFor?: (posting: Posting) => ReactNode;
  /** "Show marked postings" from the nothing-left-to-review state (AC-13). */
  onShowMarked?: () => void;
  /** The owner's own country, for "Back to Poland" after a look (remote-filter AC-06); null = none chosen. */
  ownCountry?: Country | null;
  /** The filter's empty message actions (remote-filter AC-08). */
  onSwitchFilterOff?: () => void;
  onBackFromLook?: () => void;
  /** Those actions' request in flight, and its failure with Retry (screens SCR-01 switching / switch error). */
  switching?: boolean;
  switchError?: ReactNode;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** SCR-01 list: summary line, cards and the two empty states (screens.md). */
export function SearchList({
  result,
  postings,
  previousVisitStartedAt,
  onClearSkills,
  waiting = 0,
  onRefresh,
  hasNext,
  loadingMore,
  moreError,
  onShowMore,
  actionsFor,
  bannerFor,
  onShowMarked,
  ownCountry = null,
  onSwitchFilterOff,
  onBackFromLook,
  switching = false,
  switchError,
}: SearchListProps) {
  const feed = result.skills.length === 0;
  const clear = (
    <Button className="md:self-start" onClick={onClearSkills}>
      Clear skills
    </Button>
  );

  if (result.collection_empty) {
    return (
      <div className="flex flex-col gap-3">
        <InlineBanner tone="info" title="The first collection hasn't brought postings yet.">
          <Link to="/sources" className="inline-flex min-h-11 items-center text-accent underline">
            Open source health
          </Link>
        </InlineBanner>
        {!feed && clear}
      </div>
    );
  }
  const filterCountry = result.location_filter.country?.name;
  if (result.total === 0 && result.hidden_count > 0) {
    // Empty because of the filter (remote-filter AC-08): wins over "nothing left to review".
    const look = result.location_filter.mode === "look";
    return (
      <div className="flex flex-col gap-3">
        <p>
          No posting open to {filterCountry} matches. The location filter hid {result.hidden_count}.
        </p>
        {switchError}
        <div className="flex flex-wrap gap-2">
          {look ? (
            <Button onClick={onBackFromLook} pending={switching}>
              {ownCountry ? `Back to ${ownCountry.name}` : "Back to all postings"}
            </Button>
          ) : (
            <Button onClick={onSwitchFilterOff} pending={switching}>
              Switch filter off
            </Button>
          )}
          {!feed && clear}
        </div>
      </div>
    );
  }
  const marked = result.marked_count;
  if (result.total === 0 && marked > 0) {
    // Empty only because of marks (AC-13): not search's "nothing matches".
    return (
      <div className="flex flex-col gap-3">
        <p>Nothing left to review. You've marked {count(marked, "matching posting")}.</p>
        {onShowMarked && (
          <Button className="md:self-start" onClick={onShowMarked}>
            Show marked postings
          </Button>
        )}
      </div>
    );
  }
  if (result.total === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p>Nothing matches {result.skills.join(", ")}.</p>
        {clear}
      </div>
    );
  }

  const counted = count(result.total, feed ? "open posting" : "posting");
  const hidden =
    result.hidden_count > 0 ? ` — ${result.hidden_count} hidden, not open to ${filterCountry}` : "";
  return (
    <section className="flex flex-col gap-3" aria-label="Postings">
      <p className="text-text-muted">
        {previousVisitStartedAt === null ? counted : `${counted} · ${result.new_count} new`}
        {hidden}
      </p>
      {waiting > 0 && (
        <InlineBanner
          tone="info"
          title={waiting === 1 ? "1 new posting is waiting." : `${waiting} new postings are waiting.`}
          action={{ label: "Refresh", onClick: onRefresh }}
        />
      )}
      <ul className="flex flex-col gap-3">
        {postings.map((p) => (
          <li key={p.id}>
            <PostingCard posting={p} order={result.order} banner={bannerFor?.(p)} actions={actionsFor?.(p)} />
          </li>
        ))}
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
