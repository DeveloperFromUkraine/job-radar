// SCR-02 — source health (screens.md): page states around the source cards.
import { InlineBanner } from "../components/InlineBanner";
import { SkeletonRow } from "../components/SkeletonRow";
import { CollectNowAction } from "../features/source-health/CollectNowAction";
import { useSourceHealth } from "../features/source-health/queries";
import { RunProgress } from "../features/source-health/RunProgress";
import { SourceCard } from "../features/source-health/SourceCard";

export function SourceHealth() {
  const health = useSourceHealth();
  const data = health.data;

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Source health</h1>
      <CollectNowAction disabled={health.isPending} />

      {health.isPending && [0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}

      {health.isError && (
        <InlineBanner tone="error" title="Couldn't load source health." onRetry={() => void health.refetch()}>
          {health.error.message}
        </InlineBanner>
      )}

      {data && (
        <>
          {data.settings.problem && (
            <InlineBanner tone="warning" title={`Your settings file can't be read: ${data.settings.problem}`}>
              {data.settings.running_on === "defaults"
                ? "Collection runs on the built-in defaults until the file can be read."
                : "Collection keeps running on your last valid settings."}
            </InlineBanner>
          )}
          {data.settings.notice === "defaults_in_use" && (
            <InlineBanner
              tone="info"
              title="Your settings file was missing, so it was created with the built-in defaults."
            />
          )}
          {data.last_run?.status === "incomplete" && (
            <InlineBanner
              tone="info"
              title="The last run was interrupted. Nothing was closed because of it."
            />
          )}
          {data.current_run ? (
            <RunProgress run={data.current_run} sources={data.sources} />
          ) : (
            data.last_run?.status === "finished" && <RunProgress run={data.last_run} sources={data.sources} />
          )}
          {!data.any_run_finished && (
            <InlineBanner tone="info" title="Nothing collected yet. Each source is read when it is due." />
          )}
          <div className="flex flex-col gap-3">
            {data.sources.map((row) => (
              <SourceCard key={row.source_id} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
