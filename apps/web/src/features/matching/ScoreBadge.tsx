// screens.md NEW: ScoreBadge — the total, toned by the score scale. The thresholds only pick the colour;
// they never order or hide anything.
// ponytail: fixed 70 / 40 thresholds; revisit after the 30-day applied-vs-skipped review (spec §7).
const HIGH = 70;
const MID = 40;

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= HIGH
      ? "border-score-high text-score-high"
      : score >= MID
        ? "border-score-mid text-score-mid"
        : "border-score-low text-score-low";
  return (
    <span
      role="img"
      aria-label={`Match ${score} out of 100`}
      className={`inline-flex min-w-9 justify-center rounded-full border-2 px-2 py-0.5 font-semibold tabular-nums ${tone}`}
    >
      {score}
    </span>
  );
}
