// The source registry: intervals and published limits (spec §6 Source request rate).
// One read = one request to the source, pages and failed requests included.

export type SourceId = "jobicy" | "himalayas" | "remotive" | "weworkremotely";

export interface RateLimits {
  perMinute?: number;
  perHour?: number;
  perDay?: number;
}

export interface SourceDefinition {
  id: SourceId;
  name: string;
  siteUrl: string;
  intervalMs: number;
  limits: RateLimits;
}

const HOUR = 60 * 60 * 1000;

export const SOURCES: readonly SourceDefinition[] = [
  { id: "jobicy", name: "Jobicy", siteUrl: "https://jobicy.com", intervalMs: HOUR, limits: { perHour: 1 } },
  {
    id: "himalayas",
    name: "Himalayas",
    siteUrl: "https://himalayas.app",
    intervalMs: 6 * HOUR,
    // ≤ 4 a day until spec §8 Q3 verifies the real rate.
    limits: { perDay: 4 },
  },
  {
    id: "remotive",
    name: "Remotive",
    siteUrl: "https://remotive.com",
    intervalMs: 6 * HOUR,
    limits: { perDay: 4, perMinute: 2 },
  },
  {
    id: "weworkremotely",
    name: "We Work Remotely",
    siteUrl: "https://weworkremotely.com",
    intervalMs: 6 * HOUR,
    // 0 — not read until spec §8 Q1 sets its verified limit.
    limits: { perDay: 0 },
  },
];

export function sourceById(id: SourceId): SourceDefinition {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`unknown source ${id}`);
  return source;
}

export function hasZeroRate(source: SourceDefinition): boolean {
  const { perMinute, perHour, perDay } = source.limits;
  return perMinute === 0 || perHour === 0 || perDay === 0;
}
