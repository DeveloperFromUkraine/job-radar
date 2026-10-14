/** SCR-01 NEW: MarkedToggle — "Show marked postings" (AC-05): a native switch in a 44 px label, off
 * on every visit and never remembered. */
export function MarkedToggle({
  on,
  disabled = false,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 self-start">
      <input
        type="checkbox"
        role="switch"
        aria-checked={on}
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-accent"
      />
      Show marked postings
    </label>
  );
}
