import { Link } from "react-router";
import type { ScoringHealth } from "../../api/matching";
import type { ListOrder } from "../../api/search";

const day = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/**
 * screens.md SCR-01 NEW: ScoringNotice — one line above the list: no profile yet (match-score AC-15),
 * or this month's cap is reached (AC-12). Nothing otherwise, so SearchList need not know scoring.
 */
export function ScoringNotice({
  hasProfile,
  health,
  order,
}: {
  hasProfile: boolean;
  health?: ScoringHealth;
  order?: ListOrder;
}) {
  // realness-score ADR-0003: best match first works without a profile, by realness alone.
  const bestMatchNote =
    order === "best_match"
      ? " Until you set up a profile, best match first puts postings with fewer realness signals first."
      : "";
  const notice = !hasProfile
    ? {
        text: `No scores yet — set up your profile to see how each posting fits.${bestMatchNote}`,
        action: "Set up profile",
      }
    : health?.cap_reached && health.resumes_on
      ? {
          text: `This month's scoring cap is reached. Scoring resumes on ${day(health.resumes_on)}.`,
          action: "Change cap",
        }
      : null;
  if (!notice) return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface-muted p-3 text-sm md:flex-row md:items-center"
    >
      <p className="flex-1 font-medium">{notice.text}</p>
      <Link
        to="/profile"
        className="inline-flex min-h-11 items-center justify-center rounded border border-border px-3 text-text"
      >
        {notice.action}
      </Link>
    </div>
  );
}
