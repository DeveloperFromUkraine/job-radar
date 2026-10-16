import { InlineBanner } from "../../components/InlineBanner";
import { useSetRealnessOn } from "./queries";

/**
 * SCR-01 NEW: RealnessSwitch — "Lower stale postings" (realness-score AC-10, AC-11), the MarkedToggle
 * pattern. `on` is the list's realness_on; while saving it shows the asked-for state, until the list reloads the saved one, and a failed save
 * shows the previous one again with a banner whose Retry repeats the same change.
 */
export function RealnessSwitch({
  on,
  disabled,
  onSaved,
}: {
  on: boolean;
  disabled: boolean;
  onSaved: () => void;
}) {
  const save = useSetRealnessOn(onSaved);
  // While the list reloads after a save it still holds the old realness_on, so the saved state is shown;
  // once it has reloaded the list is the truth again (re-review G-05). `disabled` is the list fetching.
  const shown = save.isPending
    ? (save.variables as boolean)
    : save.isSuccess && disabled
      ? save.data.realness_on
      : on;
  return (
    <>
      <label className="inline-flex min-h-11 items-center gap-2 self-start">
        <input
          type="checkbox"
          role="switch"
          aria-checked={shown}
          aria-description="Moves postings with realness signals lower in best match first"
          checked={shown}
          disabled={disabled || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
          className="size-5 accent-accent"
        />
        Lower stale postings
      </label>
      {save.isError && (
        <div className="basis-full">
          <InlineBanner
            tone="error"
            title="Your realness choice was not saved."
            onRetry={() => save.mutate(save.variables as boolean)}
          >
            {save.error.message}
          </InlineBanner>
        </div>
      )}
    </>
  );
}
