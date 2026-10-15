// screens.md SCR-03 NEW: CapField — the monthly scoring cap in dollars, with this month's spend and
// what a save means for scoring (match-score AC-19).
import { useId, useState } from "react";
import { ApiError } from "../../api/collector";
import type { MatchingSettings } from "../../api/matching";
import { Button } from "../../components/Button";
import { InlineBanner } from "../../components/InlineBanner";

const dollars = (cents: number) => (cents / 100).toFixed(2);
const firstOfNextMonth = (now = new Date()) =>
  new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });

/** "8", "8.5", "8.50" → cents; anything else, or outside $0–$100 → null. */
function toCents(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents <= 10_000 ? cents : null;
}

export function CapField({
  settings,
  onSave,
}: {
  settings: MatchingSettings;
  onSave: (cents: number) => Promise<MatchingSettings>;
}) {
  const id = useId();
  const [text, setText] = useState(dollars(settings.cap_usd_cents));
  const [spent, setSpent] = useState(settings.spent_usd_cents);
  const [flagged, setFlagged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const cents = toCents(text);
  const invalid = flagged && cents === null;

  const save = () => {
    setFlagged(true);
    setSaved(null);
    if (cents === null || saving) return;
    setSaving(true);
    setFailure(null);
    onSave(cents).then(
      (after) => {
        setSaving(false);
        setSpent(after.spent_usd_cents);
        setSaved(
          after.cap_usd_cents === 0
            ? "Saved — scoring paused."
            : after.cap_usd_cents > after.spent_usd_cents
              ? "Saved — scoring resumes."
              : `Saved — scoring stays stopped until ${firstOfNextMonth()}.`,
        );
      },
      (err: Error) => {
        setSaving(false);
        setFailure(err instanceof ApiError ? err.message : "Couldn't save the cap.");
      },
    );
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">Monthly scoring cap</h2>
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true">$</span>
          <label htmlFor={`${id}-cap`} className="sr-only">
            Cap in dollars
          </label>
          <input
            id={`${id}-cap`}
            type="text"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-cap-error` : undefined}
            className="min-h-11 w-32 rounded-card border border-border bg-surface px-3 text-text"
          />
        </div>
        {invalid && (
          <p id={`${id}-cap-error`} className="text-sm text-danger">
            Use an amount from $0 to $100.
          </p>
        )}
        <p className="text-sm">Spent this month: ${dollars(spent)}</p>
        <p className="text-sm text-text-muted">
          $0 pauses scoring. Also set a spending limit in your provider account.
        </p>
        {saved && <InlineBanner tone="info" title={saved} />}
        {failure && <InlineBanner tone="error" title={failure} onRetry={save} />}
        <Button type="submit" pending={saving}>
          Save cap
        </Button>
      </form>
    </section>
  );
}
