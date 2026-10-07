import { describe, expect, it } from "vitest";
import { cleanupDay, countedAgeMs, isPastRetention, RETENTION_MS } from "./retention.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);

describe("retention clock (AC-10, AC-26)", () => {
  it("counts from closing for a closed posting", () => {
    const age = countedAgeMs(
      { status: "closed", closedAt: NOW - 61 * DAY, lastOfferedAt: NOW - 70 * DAY },
      [[]],
      NOW,
    );
    expect(age).toBe(61 * DAY);
  });

  it("counts from the last offer for an open posting", () => {
    const age = countedAgeMs({ status: "open", closedAt: null, lastOfferedAt: NOW - 61 * DAY }, [[]], NOW);
    expect(age).toBe(61 * DAY);
  });

  it("keeps the clock running while only one of two sources is disabled", () => {
    const posting = { status: "open" as const, closedAt: null, lastOfferedAt: NOW - 61 * DAY };
    const age = countedAgeMs(posting, [[{ from: NOW - 30 * DAY, until: null }], []], NOW);
    expect(age).toBe(61 * DAY);
  });

  it("does not count days on which all of a posting's sources were disabled", () => {
    const posting = { status: "open" as const, closedAt: null, lastOfferedAt: NOW - 70 * DAY };
    const age = countedAgeMs(
      posting,
      [[{ from: NOW - 40 * DAY, until: NOW - 25 * DAY }], [{ from: NOW - 35 * DAY, until: NOW - 20 * DAY }]],
      NOW,
    );
    // Both disabled from day -35 to day -25 → 10 days not counted.
    expect(age).toBe(60 * DAY);
    expect(isPastRetention(age)).toBe(false);
  });

  it("counts an open-ended period up to now", () => {
    const posting = { status: "closed" as const, closedAt: NOW - 90 * DAY, lastOfferedAt: NOW - 90 * DAY };
    expect(countedAgeMs(posting, [[{ from: NOW - 80 * DAY, until: null }]], NOW)).toBe(10 * DAY);
  });

  it("ignores disabled time before the clock started", () => {
    const posting = { status: "open" as const, closedAt: null, lastOfferedAt: NOW - 61 * DAY };
    expect(countedAgeMs(posting, [[{ from: NOW - 100 * DAY, until: NOW - 61 * DAY }]], NOW)).toBe(61 * DAY);
  });

  it("removes only past more than 60 counted days", () => {
    expect(RETENTION_MS).toBe(60 * DAY);
    expect(isPastRetention(60 * DAY)).toBe(false);
    expect(isPastRetention(60 * DAY + 1)).toBe(true);
  });
});

describe("daily clean-up (AC-10)", () => {
  const tz = "Europe/Warsaw";

  it("is due for the first finished run of a calendar day in the owner's time zone", () => {
    const finishedAt = Date.UTC(2026, 9, 2, 6, 0, 0);
    expect(cleanupDay(null, finishedAt, tz)).toBe("2026-10-02");
    expect(cleanupDay("2026-10-01", finishedAt, tz)).toBe("2026-10-02");
  });

  it("is not due again the same day", () => {
    expect(cleanupDay("2026-10-02", Date.UTC(2026, 9, 2, 20, 0, 0), tz)).toBeNull();
  });

  it("uses the owner's calendar day, not UTC", () => {
    // 22:30 UTC on 2 Oct is 00:30 on 3 Oct in Warsaw (UTC+2).
    expect(cleanupDay("2026-10-02", Date.UTC(2026, 9, 2, 22, 30, 0), tz)).toBe("2026-10-03");
  });

  it("handles the day the clocks go back", () => {
    // 25 Oct 2026: Warsaw leaves UTC+2 at 01:00 UTC. 23:59 local on the 24th, then 00:01 local on the 25th.
    expect(cleanupDay(null, Date.UTC(2026, 9, 24, 21, 59, 0), tz)).toBe("2026-10-24");
    expect(cleanupDay("2026-10-24", Date.UTC(2026, 9, 24, 22, 1, 0), tz)).toBe("2026-10-25");
    expect(cleanupDay("2026-10-25", Date.UTC(2026, 9, 25, 22, 59, 0), tz)).toBeNull();
  });
});
