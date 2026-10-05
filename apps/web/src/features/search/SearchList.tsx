import { Link } from "react-router";
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
  if (result.total === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p>Nothing matches {result.skills.join(", ")}.</p>
        {clear}
      </div>
    );
  }

  const summary = count(result.total, feed ? "open posting" : "posting");
  return (
    <section className="flex flex-col gap-3" aria-label="Postings">
      <p className="text-text-muted">
        {previousVisitStartedAt === null ? summary : `${summary} · ${result.new_count} new`}
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
            <PostingCard posting={p} />
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
