// Due-ness and rolling-window limits (ADR-0003): one rule for scheduled, catch-up and collect-now runs.
// Pure functions of (now, reads, source) — the clock is always passed in.
import { hasZeroRate, type SourceDefinition } from "./sources.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A source may be read once its interval has passed since its last read; never for a 0 rate. */
export function isDue(source: SourceDefinition, lastReadAt: number | null, now: number): boolean {
  if (hasZeroRate(source)) return false;
  return lastReadAt === null || now - lastReadAt >= source.intervalMs;
}

/** When the source is next due; now when never read; null when it is never read (0 rate). */
export function nextDueAt(source: SourceDefinition, lastReadAt: number | null, now: number): number | null {
  if (hasZeroRate(source)) return null;
  return lastReadAt === null ? now : lastReadAt + source.intervalMs;
}

/** Reads strictly inside the rolling 1-minute, 60-minute and 24-hour windows ending at now. */
export function readsInWindows(readTimes: readonly number[], now: number) {
  const count = (span: number) => readTimes.filter((t) => t > now - span && t <= now).length;
  return { minute: count(MINUTE), hour: count(HOUR), day: count(DAY) };
}

/** Whether one more read now stays inside every published limit. */
export function windowAllows(source: SourceDefinition, readTimes: readonly number[], now: number): boolean {
  if (hasZeroRate(source)) return false;
  const w = readsInWindows(readTimes, now);
  const { perMinute = Infinity, perHour = Infinity, perDay = Infinity } = source.limits;
  return w.minute < perMinute && w.hour < perHour && w.day < perDay;
}
