import { InlineBanner } from "../components/InlineBanner";
import { ProblemMarker } from "../features/source-health/ProblemMarker";
import { useProblems } from "../features/source-health/queries";

/** SCR-01 — the app's home; postings arrive in roadmap step 3. */
export function Home() {
  const problems = useProblems();
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
      <p className="text-text-muted">Postings will show here once browsing arrives (roadmap step 3).</p>
    </div>
  );
}
