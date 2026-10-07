import { describe, expect, it } from "vitest";
import { graceLastDay, isProtected, ownerDay } from "./grace.js";
import type { MarkRow } from "./mark.js";

const TZ = "Europe/Kyiv";

function row(over: Partial<MarkRow>): MarkRow {
  return {
    postingId: "p",
    mark: null,
    markedAt: 0,
    previousMark: null,
    previousMarkedAt: null,
    appliedLostAt: null,
    previousAppliedLostAt: null,
    changeId: "c",
    ...over,
  };
}

// 2026-10-07 23:59 in Kyiv (UTC+3) is 20:59 UTC.
const lostLate = Date.UTC(2026, 9, 7, 20, 59);

describe("grace day (AC-07)", () => {
  it("reads the owner's calendar day in their time zone", () => {
    expect(ownerDay(lostLate, TZ)).toBe("2026-10-07");
    expect(ownerDay(lostLate + 2 * 60_000, TZ)).toBe("2026-10-08");
  });

  it("lasts until the end of the next calendar day", () => {
    expect(graceLastDay(lostLate, TZ)).toBe("2026-10-08");
  });

  it("crosses month and year ends", () => {
    expect(graceLastDay(Date.UTC(2026, 9, 31, 12), TZ)).toBe("2026-11-01");
    expect(graceLastDay(Date.UTC(2026, 11, 31, 12), TZ)).toBe("2027-01-01");
  });

  it("holds across a DST change (Kyiv leaves summer time on 2026-10-25)", () => {
    const lost = Date.UTC(2026, 9, 24, 12); // 24 Oct, 15:00 local
    expect(graceLastDay(lost, TZ)).toBe("2026-10-25");
    // 25 Oct 23:30 local is UTC+2 after the change: 21:30 UTC — still protected.
    const r = row({ mark: "skipped", appliedLostAt: lost });
    expect(isProtected(r, Date.UTC(2026, 9, 25, 21, 30), TZ)).toBe(true);
    // 26 Oct 00:30 local (22:30 UTC on the 25th) — grace over.
    expect(isProtected(r, Date.UTC(2026, 9, 25, 22, 30), TZ)).toBe(false);
  });
});

describe("isProtected (AC-07, AC-09)", () => {
  const now = Date.UTC(2026, 9, 8, 12);

  it("protects an applied posting whatever its age", () => {
    expect(isProtected(row({ mark: "applied" }), now, TZ)).toBe(true);
  });

  it("does not protect a skipped or cleared posting that never lost applied", () => {
    expect(isProtected(row({ mark: "skipped" }), now, TZ)).toBe(false);
    expect(isProtected(row({ mark: null }), now, TZ)).toBe(false);
  });

  it("protects a posting that lost applied yesterday, but not two days ago", () => {
    expect(isProtected(row({ mark: null, appliedLostAt: lostLate }), now, TZ)).toBe(true);
    expect(isProtected(row({ mark: null, appliedLostAt: lostLate }), now + 86_400_000, TZ)).toBe(false);
  });
});
