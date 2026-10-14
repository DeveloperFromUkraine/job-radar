import { describe, expect, it } from "vitest";
import { lookAlikeKey, type MarkedForHint, winningMark } from "./look-alike.js";

describe("lookAlikeKey (AC-10)", () => {
  it("matches the AC-10 example pair", () => {
    expect(lookAlikeKey("ACME", "Senior Backend Engineer")).toBe(
      lookAlikeKey("Acme Inc", "Sr. Backend Engineer (Go) – Remote"),
    );
  });

  it.each([
    ["Jr. Frontend Developer", "Junior Frontend Developer"],
    ["Backend Engineer [Contract]", "Backend Engineer"],
    ["BACKEND ENGINEER!!", "backend engineer"],
    ["Backend Engineer – fully remote", "Backend Engineer"],
  ])("treats %j and %j as similar", (a, b) => {
    expect(lookAlikeKey("Example Co", a)).toBe(lookAlikeKey("Example Co", b));
  });

  it("keeps a bracketed region, so different regions do not match", () => {
    expect(lookAlikeKey("Example Co", "Backend Engineer (Europe)")).not.toBe(
      lookAlikeKey("Example Co", "Backend Engineer"),
    );
  });

  it("does not match the same company with a different title (AC-11)", () => {
    expect(lookAlikeKey("Acme Inc", "Frontend Engineer")).not.toBe(
      lookAlikeKey("Acme Inc", "Backend Engineer"),
    );
  });

  it("does not match the same title at a different company", () => {
    expect(lookAlikeKey("Acme", "Backend Engineer")).not.toBe(lookAlikeKey("Globex", "Backend Engineer"));
  });

  it("does not read 'sr' inside a word as Senior", () => {
    expect(lookAlikeKey("Example Co", "Srini Engineer")).not.toBe(
      lookAlikeKey("Example Co", "Senior ini Engineer"),
    );
  });
});

describe("winningMark (AC-10)", () => {
  const m = (mark: "applied" | "skipped", markedAt: number): MarkedForHint => ({
    mark,
    markedAt,
    company: "Acme Inc",
  });

  it("names an applied mark over any skip", () => {
    expect(winningMark([m("skipped", 5), m("applied", 1), m("skipped", 9)])).toEqual(m("applied", 1));
  });

  it("names the most recently set skip when there is no applied mark", () => {
    expect(winningMark([m("skipped", 5), m("skipped", 9), m("skipped", 2)])).toEqual(m("skipped", 9));
  });

  it("names the most recent applied mark when there are several", () => {
    expect(winningMark([m("applied", 3), m("applied", 7)])).toEqual(m("applied", 7));
  });
});
