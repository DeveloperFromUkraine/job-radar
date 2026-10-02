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

const WINDOWS = [
  { key: "perMinute", span: MINUTE },
  { key: "perHour", span: HOUR },
  { key: "perDay", span: DAY },
] as const;

/**
 * A first-fill page may use only what the regular schedule leaves (AC-19): in every limited window,
 * the reads the regular interval needs are reserved first. With today's limits nothing is left.
 */
export function fillReadAllowed(
  source: SourceDefinition,
  readTimes: readonly number[],
  now: number,
): boolean {
  if (!windowAllows(source, readTimes, now)) return false;
  return WINDOWS.every(({ key, span }) => {
    const limit = source.limits[key];
    if (limit === undefined) return true;
    const spare = limit - Math.ceil(span / source.intervalMs);
    const used = readTimes.filter((t) => t > now - span && t <= now).length;
    return spare > 0 && used <= spare;
  });
}

/** When the oldest read inside the source's longest limited window leaves it — the next fill attempt. */
export function nextFillAttemptAt(
  source: SourceDefinition,
  readTimes: readonly number[],
  now: number,
): number {
  const span = source.limits.perDay !== undefined ? DAY : source.limits.perHour !== undefined ? HOUR : MINUTE;
  const inWindow = readTimes.filter((t) => t > now - span && t <= now);
  return inWindow.length === 0 ? now : Math.min(...inWindow) + span;
}
