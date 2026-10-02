import { describe, expect, it } from "vitest";
import { isDue, nextDueAt, readsInWindows, windowAllows } from "./schedule.js";
import { SOURCES, type SourceDefinition, sourceById } from "./sources.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 2, 0, 0, 0);

describe("source registry", () => {
  it("knows the four sources with their intervals (spec §6)", () => {
    expect(SOURCES.map((s) => s.id)).toEqual(["jobicy", "himalayas", "remotive", "weworkremotely"]);
    expect(sourceById("jobicy").intervalMs).toBe(HOUR);
    expect(sourceById("remotive").intervalMs).toBe(6 * HOUR);
    expect(sourceById("himalayas").intervalMs).toBe(6 * HOUR);
  });

  it("encodes each source's published limit (spec §6 Source request rate)", () => {
    expect(sourceById("jobicy").limits).toEqual({ perHour: 1 });
    expect(sourceById("remotive").limits).toEqual({ perDay: 4, perMinute: 2 });
    expect(sourceById("himalayas").limits).toEqual({ perDay: 4 });
    expect(sourceById("weworkremotely").limits).toEqual({ perDay: 0 });
  });
});

describe("due-ness (AC-02)", () => {
  const jobicy = sourceById("jobicy");

  it("a never-read source is due", () => {
    expect(isDue(jobicy, null, T0)).toBe(true);
  });

  it("is not due before its interval has passed since the last read", () => {
    expect(isDue(jobicy, T0, T0 + 59 * MIN)).toBe(false);
  });

  it("is due exactly one interval after the last read", () => {
    expect(isDue(jobicy, T0, T0 + HOUR)).toBe(true);
  });

  it("a source whose allowed rate is 0 is never due", () => {
    const wwr = sourceById("weworkremotely");
    expect(isDue(wwr, null, T0)).toBe(false);
    expect(nextDueAt(wwr, null, T0)).toBeNull();
  });

  it("next due is the last read plus the interval, or now when never read", () => {
    expect(nextDueAt(jobicy, T0, T0 + 5 * MIN)).toBe(T0 + HOUR);
    expect(nextDueAt(jobicy, null, T0 + 5 * MIN)).toBe(T0 + 5 * MIN);
  });
});

describe("rolling windows", () => {
  it("counts reads strictly inside each rolling window", () => {
    const reads = [T0 - DAY, T0 - DAY + 1, T0 - HOUR + 1, T0 - 30_000];
    expect(readsInWindows(reads, T0)).toEqual({ minute: 1, hour: 2, day: 3 });
  });

  it("blocks a read once a window's limit is used up", () => {
    const remotive = sourceById("remotive");
    expect(windowAllows(remotive, [T0 - 10_000, T0 - 20_000], T0)).toBe(false); // 2 per minute
    expect(windowAllows(remotive, [T0 - 5 * HOUR, T0 - 10 * HOUR, T0 - 15 * HOUR, T0 - 20 * HOUR], T0)).toBe(
      false,
    );
    expect(windowAllows(remotive, [T0 - 5 * HOUR, T0 - 10 * HOUR, T0 - 15 * HOUR], T0)).toBe(true);
  });

  it("never allows a read for a source whose allowed rate is 0", () => {
    expect(windowAllows(sourceById("weworkremotely"), [], T0)).toBe(false);
  });
});

describe("7 days of scheduled runs, collect-now every minute and greedy fill pages", () => {
  // Every minute a run is attempted (schedule and collect-now alike); a due source gets its regular
  // read, then a fill reader takes pages while the window allows — the worst case for the limits.
  function simulate(source: SourceDefinition) {
    const reads: number[] = [];
    let lastReadAt: number | null = null;
    for (let now = T0; now < T0 + 7 * DAY; now += MIN) {
      if (isDue(source, lastReadAt, now) && windowAllows(source, reads, now)) {
        reads.push(now);
        lastReadAt = now;
        while (windowAllows(source, reads, now)) reads.push(now); // fill pages
      }
      const w = readsInWindows(reads, now);
      const { perMinute = Infinity, perHour = Infinity, perDay = Infinity } = source.limits;
      if (w.minute > perMinute || w.hour > perHour || w.day > perDay) {
        throw new Error(
          `${source.id} over its limit at ${new Date(now).toISOString()}: ${JSON.stringify(w)}`,
        );
      }
    }
    return reads.length;
  }

  it.each(SOURCES.map((s) => [s.id, s] as const))("%s never exceeds its limit", (_id, source) => {
    const total = simulate(source);
    if (source.limits.perDay === 0) expect(total).toBe(0);
    else expect(total).toBeGreaterThan(0);
  });
});
