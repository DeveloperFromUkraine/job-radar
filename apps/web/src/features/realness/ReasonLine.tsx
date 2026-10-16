import type { ListOrder, Realness, RealnessSignal } from "../../api/search";

// Built only from the signals' kinds and numbers, never from posting text (realness-score spec §6.1).
function phrase(s: RealnessSignal): string {
  switch (s.kind) {
    case "age":
      return `${s.basis === "posted" ? "posted" : "first found"} ${s.days} days ago`;
    case "many_boards":
      return `on ${s.boards} boards · first found ${s.days} days ago`;
    case "repost":
      return "reposted";
    case "no_salary":
      return "no salary listed";
  }
}

/** SCR-01 reason line (screens.md NEW: ReasonLine): "Lowered: …" in best match first, "Signals: …" in newest first. */
export function ReasonLine({ realness, order }: { realness: Realness | null; order: ListOrder }) {
  if (!realness || realness.signals.length === 0) return null;
  const prefix = order === "best_match" ? "Lowered: " : "Signals: ";
  return <p className="text-sm text-text-muted">{prefix + realness.signals.map(phrase).join(" · ")}</p>;
}
