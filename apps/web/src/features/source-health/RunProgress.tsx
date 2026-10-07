// The run in progress — or the last finished run — source by source (SCR-02 02-e).
import {
  type Run,
  type RunSourceOutcome,
  SOURCE_NAMES,
  type SourceHealthRow,
  type SourceId,
} from "../../api/collector";
import { ago, exact } from "../../lib/time";

const ORDER: SourceId[] = ["jobicy", "himalayas", "remotive", "weworkremotely"];

function outcomeText(o: RunSourceOutcome): string {
  if (o.outcome === "pending") return "reading…";
  if (o.outcome === "failed") return `failed: ${o.failure_reason ?? "unknown reason"}`;
  return `collected +${o.counts.added} · ${o.counts.updated} updated`;
}

export function RunProgress({
  run,
  sources,
  now = Date.now(),
}: {
  run: Run;
  sources: SourceHealthRow[];
  now?: number;
}) {
  const time = new Date(run.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const rows = ORDER.flatMap((id) => {
    const inRun = run.sources.find((s) => s.source_id === id);
    if (inRun) return [{ id, text: outcomeText(inRun) }];
    const row = sources.find((s) => s.source_id === id);
    if (!row) return [];
    const text =
      row.state === "disabled" ? "disabled" : row.state === "not_verified" ? "not verified" : "not due yet";
    return [{ id, text }];
  });

  return (
    <section className="flex flex-col gap-1 rounded-card border border-border p-3 text-sm">
      {run.status === "running" ? (
        <p className="font-medium" title={exact(run.started_at)}>
          Run in progress · started {time}
        </p>
      ) : (
        <p className="font-medium" title={exact(run.finished_at ?? run.started_at)}>
          Last run finished {ago(run.finished_at ?? run.started_at, now)}
        </p>
      )}
      <ul aria-label="Run progress" className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <span>{SOURCE_NAMES[r.id].name}</span>
            <span className="text-text-muted">{r.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
