import { useId, useState } from "react";
import type { Match, MatchParts } from "../../api/matching";
import { ScoreBadge } from "./ScoreBadge";

// The fit note and the claims are model output built from third-party posting text: rendered only as
// React text, never as markup, and claims always as the posting's own words (match-score AC-03).

const PARTS: [keyof MatchParts, string][] = [
  ["skills", "Skills"],
  ["role_type", "Role type"],
  ["seniority", "Seniority"],
  ["terms", "Terms"],
];

const STALE = {
  posting_changed: "Scored against an earlier version of this posting",
  profile_changed: "Scored against your previous profile",
} as const;

function WhyNoScore({ match }: { match: Match }) {
  const text =
    match.state === "pending"
      ? "Not scored yet — waiting its turn"
      : match.state === "could_not_score"
        ? `Could not be scored — ${match.reason}`
        : `Not scored — ${match.reason}`;
  return <p className="text-sm text-text-muted">{text}</p>;
}

/** screens.md SCR-01 NEW: MatchSummary — the score with its note and parts, or why there is none. */
export function MatchSummary({ match }: { match: Match }) {
  const [open, setOpen] = useState(false);
  const partsId = useId();
  if (match.state !== "scored" || match.total === null) {
    return (
      <div data-match>
        <WhyNoScore match={match} />
      </div>
    );
  }
  return (
    <div data-match className="flex flex-col gap-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <ScoreBadge score={match.total} />
          <span className="text-text-muted">match</span>
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={partsId}
          onClick={() => setOpen((v) => !v)}
          className="min-h-11 min-w-11 px-2 text-accent underline"
        >
          {open ? "Hide details" : "Details"}
        </button>
      </div>
      {match.stale && <p className="text-text-muted">{STALE[match.stale]}</p>}
      {match.note && <p>{match.note}</p>}
      {open && (
        <div id={partsId} className="flex flex-col gap-1">
          <ul aria-label="Score parts" className="grid grid-cols-[auto_1fr] gap-x-4">
            {PARTS.map(([key, label]) => {
              const v = match.parts?.[key] ?? null;
              return (
                <li key={key} className="col-span-2 grid grid-cols-subgrid">
                  <span>{label}</span>
                  <span className={v === null ? "text-text-muted" : "tabular-nums"}>
                    {v === null ? " not stated" : v}
                  </span>
                </li>
              );
            })}
          </ul>
          {match.claims.map((c) => (
            <p key={c}>The posting says: “{c}”</p>
          ))}
        </div>
      )}
    </div>
  );
}
