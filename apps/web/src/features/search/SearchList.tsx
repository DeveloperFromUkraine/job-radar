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
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** SCR-01 list: summary line, cards and the two empty states (screens.md). */
export function SearchList({ result, postings, previousVisitStartedAt, onClearSkills }: SearchListProps) {
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
      <ul className="flex flex-col gap-3">
        {postings.map((p) => (
          <li key={p.id}>
            <PostingCard posting={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
