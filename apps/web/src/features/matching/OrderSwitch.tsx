import type { ListOrder } from "../../api/search";

const OPTIONS: [ListOrder, string][] = [
  ["newest", "Newest first"],
  ["best_match", "Best match"],
];

/** screens.md SCR-01 NEW: OrderSwitch — two named orders as a native radio group (match-score AC-11). */
export function OrderSwitch({
  order,
  disabled = false,
  onChange,
}: {
  order: ListOrder;
  disabled?: boolean;
  onChange: (order: ListOrder) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">Order</legend>
      <div role="radiogroup" aria-label="Order" className="flex flex-wrap gap-2">
        {OPTIONS.map(([value, label]) => (
          <label
            key={value}
            className="inline-flex min-h-11 items-center gap-2 rounded-card border border-border px-3 has-[:checked]:border-accent has-[:checked]:text-accent"
          >
            <input
              type="radio"
              name="order"
              value={value}
              checked={order === value}
              disabled={disabled}
              onChange={() => onChange(value)}
              className="size-5 accent-accent"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
