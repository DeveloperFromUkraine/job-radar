import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/collector";
import type { SearchResult } from "../api/search";
import { InlineBanner } from "../components/InlineBanner";
import { SkeletonRow } from "../components/SkeletonRow";
import { type SearchRequest, useSearchList, useVisit, useWaitingCount } from "../features/search/queries";
import { SearchList } from "../features/search/SearchList";
import { SkillsField } from "../features/search/SkillsField";
import { ProblemMarker } from "../features/source-health/ProblemMarker";
import { useProblems } from "../features/source-health/queries";
import { MarkActions } from "../features/tracking/MarkActions";
import { useMarks } from "../features/tracking/mutations";
import { noticeKey, UndoNotice } from "../features/tracking/UndoNotice";

/** SCR-01 — the skills search over open postings, the feed when no skills are entered. */
export function Home() {
  const problems = useProblems();
  const visit = useVisit();
  const [skills, setSkills] = useState("");
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const list = useSearchList(request);

  // Flow 1: the remembered skills fill the field, then the first search runs (AC-13).
  useEffect(() => {
    if (!visit.data || request) return;
    const remembered = visit.data.last_skills.join(", ");
    setSkills(remembered);
    setRequest({ skills: remembered, run: 0 });
  }, [visit.data, request]);

  const marks = useMarks();
  // "Show marked postings" (AC-05): off on every visit; T16 renders the marked view from it.
  const [, setMarkedView] = useState(false);
  const showMarked = () => {
    marks.closeNotice();
    setMarkedView(true);
  };
  const [expired, setExpired] = useState(false);
  const search = (text: string) => {
    setExpired(false);
    marks.reset();
    setRequest((r) => ({ skills: text, run: (r?.run ?? 0) + 1 }));
  };

  // A failed or refused search leaves the last list on screen (AC-05, AC-12).
  const shown = useRef(list.data);
  if (list.data) shown.current = list.data;
  const pages = shown.current?.pages;
  const result = pages?.[0] as SearchResult | undefined;

  const waiting = useWaitingCount(result?.snapshot_id); // errors stay silent (contract)

  // Cards marked in this window leave the list and its counts; pages are never refetched (AC-12).
  const allShown = (pages ?? []).flatMap((p) => p.items);
  const postings = allShown.filter((p) => !marks.hidden.has(p.id));
  const hiddenNew = allShown.filter((p) => marks.hidden.has(p.id) && p.is_new).length;
  const counted = result && {
    ...result,
    total: result.total - (allShown.length - postings.length),
    new_count: result.new_count - hiddenNew,
    marked_count: (result.marked_count ?? 0) + (allShown.length - postings.length),
  };

  const code = list.error instanceof ApiError ? list.error.code : undefined;
  const moreFailed = list.isFetchNextPageError;
  const invalid = !moreFailed && code === "SEARCH_INVALID_SKILLS";
  const failed = visit.error ?? (invalid || moreFailed ? null : list.error);
  const loading = !result && !failed && !invalid;

  // A snapshot dropped by restart, idle time or the cap: reload from the newest (ADR-0003).
  const snapshotExpired = moreFailed && code === "SEARCH_SNAPSHOT_EXPIRED";
  useEffect(() => {
    if (!snapshotExpired || !request) return;
    setRequest({ skills: request.skills, run: request.run + 1 });
    setExpired(true);
  }, [snapshotExpired, request]);

  return (
    <div className="flex flex-col gap-4">
      {problems.data?.has_problem && <ProblemMarker />}
      {problems.isError && (
        <InlineBanner
          tone="error"
          title="Couldn't check your sources."
          onRetry={() => void problems.refetch()}
        >
          {problems.error.message}
        </InlineBanner>
      )}
      <SkillsField
        value={skills}
        onChange={setSkills}
        onSubmit={() => search(skills)}
        disabled={loading}
        pending={list.isFetching && !list.isFetchingNextPage}
        error={invalid ? list.error?.message : undefined}
      />
      {failed && (
        <InlineBanner
          tone="error"
          title="Couldn't load postings."
          onRetry={() => void (visit.error ? visit.refetch() : list.refetch())}
        >
          {failed.message}
        </InlineBanner>
      )}
      {loading && (
        <div className="flex flex-col gap-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}
      {expired && (
        <InlineBanner tone="info" title="This list had expired and was reloaded from the newest." />
      )}
      {counted && (
        <SearchList
          result={counted}
          postings={postings}
          previousVisitStartedAt={visit.data?.previous_visit_started_at ?? null}
          onClearSkills={() => {
            setSkills("");
            search("");
          }}
          waiting={waiting.data?.waiting_count}
          onRefresh={() => search(skills)}
          // Only the current request's own pages: a kept list after a refused, failed or running search
          // can't be paged from here (fetchNextPage would re-run that search) (AC-05, AC-12).
          hasNext={list.hasNextPage && !list.isPlaceholderData}
          loadingMore={list.isFetchingNextPage}
          moreError={moreFailed && !snapshotExpired ? list.error?.message : undefined}
          onShowMore={() => void list.fetchNextPage()}
          onShowMarked={showMarked}
          bannerFor={(p) => {
            const failure = marks.failed.get(p.id);
            return (
              failure && (
                <InlineBanner
                  tone="error"
                  title="Couldn't save your mark."
                  onRetry={() => marks.mark(p.id, failure.choice)}
                >
                  {failure.message}
                </InlineBanner>
              )
            );
          }}
          actionsFor={(p) => (
            <MarkActions
              title={p.title}
              mark={null}
              pending={marks.pending?.postingId === p.id ? marks.pending.choice : undefined}
              onChoose={(choice) => marks.mark(p.id, choice)}
            />
          )}
        />
      )}
      {marks.notice && (
        <UndoNotice
          key={noticeKey(marks.notice)}
          notice={marks.notice}
          onUndo={marks.undo}
          onClose={marks.closeNotice}
          onShowMarked={showMarked}
          undoPending={marks.undoPending}
        />
      )}
    </div>
  );
}
