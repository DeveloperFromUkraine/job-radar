import type { Mark } from "../../api/search";
import { Button } from "../../components/Button";

export type Choice = Mark | null; // null = clear

interface MarkActionsProps {
  /** The posting title, for accessible names that tell repeated buttons apart. */
  title: string;
  /** The posting's current mark; null shows Applied + Skipped. */
  mark: Mark | null;
  onChoose: (choice: Choice) => void;
  /** The choice whose call is in flight: that button spins, every button is disabled. */
  pending?: Choice | undefined;
  /** AC-07: losing applied on an at-risk posting asks first. */
  confirm?: { onContinue: () => void; onCancel: () => void } | undefined;
}

const LABEL = { applied: "Applied", skipped: "Skipped" } as const;

/** SCR-01 NEW: MarkActions — two 44 px actions 8 px apart at the bottom of a card (spec §6 Phone layout). */
export function MarkActions({ title, mark, onChoose, pending, confirm }: MarkActionsProps) {
  if (confirm) {
    return (
      <div className="grid gap-2">
        <p className="rounded-card border border-danger bg-surface-muted p-3 text-sm text-text">
          Without the applied mark, this posting will be removed at clean-up.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={confirm.onContinue}>Continue</Button>
          <Button onClick={confirm.onCancel}>Cancel</Button>
        </div>
      </div>
    );
  }
  const choices: Choice[] =
    mark === null ? ["applied", "skipped"] : [mark === "applied" ? "skipped" : "applied", null];
  return (
    <div className="grid grid-cols-2 gap-2">
      {choices.map((c) => (
        <Button
          key={c ?? "clear"}
          aria-label={c === null ? `Clear the mark on ${title}` : `Mark ${title} ${c}`}
          pending={pending === c}
          disabled={pending !== undefined}
          onClick={() => onChoose(c)}
        >
          {c === null ? "Clear" : LABEL[c]}
        </Button>
      ))}
    </div>
  );
}
