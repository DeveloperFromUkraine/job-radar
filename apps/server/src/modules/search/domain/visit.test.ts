import { describe, expect, it } from "vitest";
import { isNew, nextVisit, VISIT_GAP_MS } from "./visit.js";

const MIN = 60_000;
const empty = { visitStartedAt: null, visitLastSeenAt: null, previousVisitStartedAt: null };

describe("nextVisit (AC-14)", () => {
  it("starts the first visit ever with no previous visit", () => {
    expect(nextVisit(empty, 1_000)).toEqual({
      visitStartedAt: 1_000,
      visitLastSeenAt: 1_000,
      previousVisitStartedAt: null,
    });
  });

  it("keeps the visit when reopened within 30 minutes (exactly 30 included)", () => {
    const state = { visitStartedAt: 0, visitLastSeenAt: 10 * MIN, previousVisitStartedAt: -5 };
    expect(nextVisit(state, 40 * MIN)).toEqual({ ...state, visitLastSeenAt: 40 * MIN });
    expect(VISIT_GAP_MS).toBe(30 * MIN);
  });

  it("starts a new visit after more than 30 minutes; the current start becomes previous", () => {
    const state = { visitStartedAt: 0, visitLastSeenAt: 10 * MIN, previousVisitStartedAt: -5 };
    expect(nextVisit(state, 40 * MIN + 1)).toEqual({
      visitStartedAt: 40 * MIN + 1,
      visitLastSeenAt: 40 * MIN + 1,
      previousVisitStartedAt: 0,
    });
  });
});

describe("isNew (AC-14)", () => {
  it("is new only when first collected strictly after the previous visit's start", () => {
    expect(isNew(101, 100)).toBe(true);
    expect(isNew(100, 100)).toBe(false);
    expect(isNew(99, 100)).toBe(false);
  });
  it("marks nothing new on the first visit", () => {
    expect(isNew(101, null)).toBe(false);
  });
});
