import { describe, expect, it } from "vitest";
import {
  fits,
  maxCostMicros,
  monthWindow,
  type Price,
  settledCostMicros,
  toCentsUp,
  usdToMicros,
} from "./spend.js";

// Opus 5.5 defaults (sad.md §7): $4 input, $20 output, $0.20 cache read per million tokens; cache write $5.
const price: Price = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };

describe("maxCostMicros (ADR-0006)", () => {
  it("bounds input as one token per UTF-8 byte at the cache-write rate plus the output limit", () => {
    // 10,000 bytes × $5/MTok = $0.05; 600 output tokens × $20/MTok = $0.012 → 62,000 micros.
    expect(maxCostMicros(10_000, 600, price)).toBe(62_000);
  });

  it("is never below the settled cost of any answer that fits the limits", () => {
    const usage = { inputTokens: 3_000, cacheWriteTokens: 2_000, cacheReadTokens: 4_000, outputTokens: 600 };
    expect(settledCostMicros(usage, price)).toBeLessThanOrEqual(maxCostMicros(10_000, 600, price));
  });
});

describe("settledCostMicros", () => {
  it("prices every usage figure at its own rate, rounding up", () => {
    // 1,000×4 + 500×5 + 2,000×0.2 + 300×20 = 4,000 + 2,500 + 400 + 6,000
    expect(
      settledCostMicros(
        { inputTokens: 1_000, cacheWriteTokens: 500, cacheReadTokens: 2_000, outputTokens: 300 },
        price,
      ),
    ).toBe(12_900);
    expect(
      settledCostMicros({ inputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 1, outputTokens: 0 }, price),
    ).toBe(5);
  });
});

describe("fits (AC-12, AC-19)", () => {
  const cap = usdToMicros(5);
  it("refuses any attempt that would take $4.98 past $5 (AC-12)", () => {
    expect(fits({ spent: usdToMicros(4.98), cost: 20_001, cap })).toBe(false);
    expect(fits({ spent: usdToMicros(4.98), cost: 20_000, cap })).toBe(true);
  });

  it("refuses everything when the cap is at or below what is spent, or $0 (AC-19)", () => {
    expect(fits({ spent: usdToMicros(5), cost: 1, cap })).toBe(false);
    expect(fits({ spent: usdToMicros(6), cost: 1, cap })).toBe(false);
    expect(fits({ spent: 0, cost: 1, cap: 0 })).toBe(false);
  });
});

describe("monthWindow (machine time zone)", () => {
  it("starts the month at local midnight on the 1st and resumes on the 1st of the next", () => {
    // 2026-10-20 12:00 in Warsaw (CEST, UTC+2).
    const w = monthWindow(Date.UTC(2026, 9, 20, 10), "Europe/Warsaw");
    expect(new Date(w.start).toISOString()).toBe("2026-09-30T22:00:00.000Z");
    // November starts after the DST change: UTC+1.
    expect(new Date(w.end).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(w.resumesOn).toBe("2026-11-01");
  });

  it("puts the first minutes of a month in that month, not the previous one", () => {
    const w = monthWindow(Date.UTC(2026, 9, 31, 23, 5), "Europe/Warsaw"); // 00:05 on 1 November in Warsaw
    expect(w.resumesOn).toBe("2026-12-01");
  });

  it("works for a time zone behind UTC and across a year end", () => {
    const w = monthWindow(Date.UTC(2027, 0, 1, 3), "America/New_York"); // 22:00 on 31 December locally
    expect(w.resumesOn).toBe("2027-01-01");
    expect(new Date(w.start).toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("toCentsUp", () => {
  it("never shows less than the ledger holds", () => {
    expect(toCentsUp(4_980_000)).toBe(498);
    expect(toCentsUp(4_980_001)).toBe(499);
    expect(toCentsUp(0)).toBe(0);
  });
});
