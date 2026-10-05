import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SearchDeps } from "../src/modules/search/app/deps.js";
import { openVisit, touchVisit } from "../src/modules/search/app/visits.js";
import { readState, saveLastSkills } from "../src/modules/search/infra/repo.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const MIN = 60_000;
let t: TempDb;
let clock: number;
let deps: SearchDeps;

beforeEach(() => {
  t = createTempDb();
  clock = Date.UTC(2026, 9, 5, 9);
  deps = { db: t.db, now: () => clock };
});
afterEach(() => t.cleanup());

describe("remembered skills (AC-13)", () => {
  it("returns no skills before any search", () => {
    expect(openVisit(deps).lastSkills).toEqual([]);
  });

  it("round-trips the last skills, and a cleared search empties them", () => {
    saveLastSkills(t.db, ["React", "Go"]);
    expect(openVisit(deps).lastSkills).toEqual(["React", "Go"]);
    saveLastSkills(t.db, null);
    expect(openVisit(deps).lastSkills).toEqual([]);
  });
});

describe("visits (AC-14)", () => {
  it("starts the first visit with no previous visit", () => {
    expect(openVisit(deps).previousVisitStartedAt).toBeNull();
    expect(readState(t.db)).toMatchObject({ visitStartedAt: clock, visitLastSeenAt: clock });
  });

  it("keeps the visit on a reopen 10 minutes later", () => {
    const start = clock;
    openVisit(deps);
    clock += 10 * MIN;
    expect(openVisit(deps).previousVisitStartedAt).toBeNull();
    expect(readState(t.db)).toMatchObject({ visitStartedAt: start, visitLastSeenAt: clock });
  });

  it("rolls the visit on a reopen 31 minutes after last seen", () => {
    const first = clock;
    openVisit(deps);
    clock += 31 * MIN;
    expect(openVisit(deps).previousVisitStartedAt).toBe(first);
    expect(readState(t.db)).toMatchObject({ visitStartedAt: clock, previousVisitStartedAt: first });
  });

  it("keeps a visit alive through heartbeats and never starts one from a heartbeat", () => {
    const first = clock;
    openVisit(deps);
    for (let i = 0; i < 3; i++) {
      clock += 20 * MIN;
      touchVisit(deps);
    }
    expect(readState(t.db)).toMatchObject({ visitStartedAt: first, visitLastSeenAt: clock });
    clock += 10 * MIN;
    expect(openVisit(deps).previousVisitStartedAt).toBeNull(); // still the first visit
  });
});
