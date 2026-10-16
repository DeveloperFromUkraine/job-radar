// screens.md SCR-02 NEW: ScoringHealthCard — scoring's own state beside the sources (match-score AC-12,
// AC-14, AC-18). The reason is plain API text, rendered as text; the provider key is never on screen.
import { Link } from "react-router";
import type { ScoringHealth } from "../../api/matching";
import { Badge } from "../../components/Badge";
import { InlineBanner } from "../../components/InlineBanner";
import { SkeletonRow } from "../../components/SkeletonRow";
import { ago } from "../../lib/time";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

const action = "inline-flex min-h-11 items-center self-start rounded border border-border px-3 text-text";

interface Props {
  health?: ScoringHealth;
  hasProfile: boolean;
  loading?: boolean;
  error?: string;
  onRetry: () => void;
  now?: number;
}

export function ScoringHealthCard({ health, hasProfile, loading, error, onRetry, now = Date.now() }: Props) {
  if (loading) return <SkeletonRow />;
  if (error !== undefined || !health) {
    return (
      <InlineBanner tone="error" title="Couldn't load scoring health." onRetry={onRetry}>
        {error}
      </InlineBanner>
    );
  }
  const capReached = health.problem?.kind === "cap_reached";
  const problem = health.problem && !capReached ? health.problem : null;
  const badge = problem ? (
    <Badge tone="problem">Not scoring</Badge>
  ) : capReached ? (
    <Badge tone="notice">Cap reached</Badge>
  ) : (
    <Badge tone="enabled">Working</Badge>
  );
  return (
    <article className="flex flex-col gap-1 rounded-card border border-border p-3 text-sm">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Scoring</h2>
        {badge}
      </header>
      {!hasProfile ? (
        <>
          <p>Scoring starts once you set up your profile.</p>
          <Link to="/profile" className={action}>
            Set up profile
          </Link>
        </>
      ) : (
        <>
          {problem && <p>{problem.reason}</p>}
          <p>
            {health.last_success_at
              ? `Last scored ${ago(health.last_success_at, now)}`
              : "Not scored anything yet"}
          </p>
          <p>
            {capReached && health.resumes_on
              ? `${dollars(health.spent_usd_cents)} of ${dollars(health.cap_usd_cents)} — resumes on ${day(health.resumes_on)}`
              : `${dollars(health.spent_usd_cents)} of ${dollars(health.cap_usd_cents)} this month`}
          </p>
          {health.pending_count > 0 && (
            <p>
              {health.pending_count} pending
              {health.oldest_pending_since &&
                ` · oldest ${ago(health.oldest_pending_since, now).replace(/ ago$/, "")}`}
            </p>
          )}
          {health.could_not_score_count > 0 && (
            <p>{health.could_not_score_count} could not be scored this month</p>
          )}
          {capReached && (
            <Link to="/profile" className={action}>
              Change cap
            </Link>
          )}
        </>
      )}
    </article>
  );
}
