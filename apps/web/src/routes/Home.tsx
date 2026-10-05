import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/collector";
import type { SearchResult } from "../api/search";
import { InlineBanner } from "../components/InlineBanner";
import { SkeletonRow } from "../components/SkeletonRow";
import { type SearchRequest, useSearchList, useVisit } from "../features/search/queries";
import { SearchList } from "../features/search/SearchList";
import { SkillsField } from "../features/search/SkillsField";
import { ProblemMarker } from "../features/source-health/ProblemMarker";
import { useProblems } from "../features/source-health/queries";

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

  const search = (text: string) => setRequest((r) => ({ skills: text, run: (r?.run ?? 0) + 1 }));

  // A failed or refused search leaves the last list on screen (AC-05, AC-12).
  const shown = useRef(list.data);
  if (list.data) shown.current = list.data;
  const pages = shown.current?.pages;
  const result = pages?.[0] as SearchResult | undefined;

  const invalid = list.error instanceof ApiError && list.error.code === "SEARCH_INVALID_SKILLS";
  const failed = visit.error ?? (invalid ? null : list.error);
  const loading = !result && !failed && !invalid;

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
      {result && (
        <SearchList
          result={result}
          postings={(pages ?? []).flatMap((p) => p.items)}
          previousVisitStartedAt={visit.data?.previous_visit_started_at ?? null}
          onClearSkills={() => {
            setSkills("");
            search("");
          }}
        />
      )}
    </div>
  );
}
