// One source's health on SCR-02 (screens.md, source card states). API text renders as text only.
import { SOURCE_NAMES, type SourceHealthRow } from "../../api/collector";
import { Badge } from "../../components/Badge";
import { ago, exact, shortDate, until } from "../../lib/time";

export function SourceCard({ row, now = Date.now() }: { row: SourceHealthRow; now?: number }) {
  const source = SOURCE_NAMES[row.source_id];
  const problems = row.flags.filter((f) => f.raises_marker);
  const notices = row.flags.filter((f) => !f.raises_marker);
  const counts = row.last_outcome?.counts;
  const muted = row.state !== "enabled";

  const badge =
    row.state === "disabled" ? (
      <Badge tone="disabled">Disabled</Badge>
    ) : row.state === "not_verified" ? (
      <Badge tone="not_verified">Not verified</Badge>
    ) : problems.length > 0 ? (
      <Badge tone="problem">Problem</Badge>
    ) : (
      <Badge tone="enabled">Enabled</Badge>
    );

  return (
    <article
      className={`flex flex-col gap-1 rounded-[var(--radius-card)] border border-border p-3 text-sm ${muted ? "opacity-80" : ""}`}
    >
      <header className="flex items-center justify-between gap-2">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-text underline"
        >
          {source.name}
        </a>
        {badge}
      </header>

      {row.state === "disabled" && (
        <p className="text-text-muted">Disabled in your settings. Its postings are kept.</p>
      )}
      {row.state === "not_verified" && (
        <p className="text-text-muted">Enabled, not read until its limits are verified.</p>
      )}

      {problems.map((f) => (
        <p key={f.kind} className="flex gap-1 text-danger">
          <span aria-hidden="true">(!)</span>
          <span>{f.reason}</span>
        </p>
      ))}

      {row.state === "enabled" && row.last_success_at === null && (
        <p className="text-text-muted">
          Not collected yet{row.next_due_at && ` · due ${until(row.next_due_at, now)}`}
        </p>
      )}

      {row.state === "enabled" && row.last_success_at !== null && (
        <>
          <p className="text-text-muted" title={exact(row.last_success_at)}>
            Last success {ago(row.last_success_at, now)}
          </p>
          {counts && (
            <p>
              Last run: +{counts.added} new · {counts.updated} updated · {counts.closed} closed ·{" "}
              {counts.held} held
            </p>
          )}
          {row.next_due_at && (
            <p className="text-text-muted" title={exact(row.next_due_at)}>
              Next due {until(row.next_due_at, now)}
            </p>
          )}
          <p className="text-text-muted">
            Reads 24 h: {row.reads.last_24_h}
            {row.freshness.p90_minutes !== null &&
              ` · Fresh p90: ${(row.freshness.p90_minutes / 60).toFixed(1)} h`}
          </p>
        </>
      )}

      {row.fill.status === "continuing" && (
        <p className="text-text-muted">
          Filling the last 30 days:
          {row.fill.reached_at && ` reached ${shortDate(row.fill.reached_at)}`}
          {row.fill.next_part_due_at && ` · next part ${until(row.fill.next_part_due_at, now)}`}
        </p>
      )}

      {row.fill.status === "limited" && (
        <p className="text-text-muted">
          {`First 30 days${row.fill.reached_at ? `: reached ${shortDate(row.fill.reached_at)}` : ""}. Its allowed rate leaves no room to fill further.`}
        </p>
      )}

      {notices.map((f) => (
        <p key={f.kind} className="flex gap-1">
          <span aria-hidden="true">(i)</span>
          <span>{f.reason}</span>
        </p>
      ))}
      {counts && counts.no_category > 0 && (
        <p className="flex gap-1">
          <span aria-hidden="true">(i)</span>
          <span>{`${counts.no_category} listings had no category and were skipped.`}</span>
        </p>
      )}
    </article>
  );
}
