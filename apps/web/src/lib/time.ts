// Short relative times ("40 min ago", "in 6 h"); the exact local time goes in the `title` (screens.md).
const MIN = 60_000;
const HOUR = 60 * MIN;

function span(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / (24 * HOUR))} days`;
}

export function ago(iso: string, now: number): string {
  return `${span(Math.max(0, now - Date.parse(iso)))} ago`;
}

/** "in 20 min", or "now" once the time has come. */
export function until(iso: string, now: number): string {
  const ms = Date.parse(iso) - now;
  return ms <= 0 ? "now" : `in ${span(ms)}`;
}

export function exact(iso: string): string {
  return new Date(iso).toLocaleString();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Sep" — fixed month names, so the text does not depend on the runtime's locale data. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
