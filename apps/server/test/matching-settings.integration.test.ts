import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMatchingConfig } from "../src/core/config.js";
import { AppError } from "../src/core/errors.js";
import type { MatchingDeps } from "../src/modules/matching/app/deps.js";
import { agreeNotice, getSettings, saveProfile, setCap } from "../src/modules/matching/app/settings.js";
import type { Profile } from "../src/modules/matching/domain/profile.js";
import { readSettings } from "../src/modules/matching/infra/repo.js";
import { AC01_PROFILE, seedProfile, seedSpend } from "./helpers/matching-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const NOW = Date.UTC(2026, 9, 20, 10);
let t: TempDb;
let deps: MatchingDeps;
let wakes: number;

beforeEach(() => {
  t = createTempDb();
  wakes = 0;
  deps = {
    db: t.db,
    now: () => NOW,
    timeZone: "Europe/Warsaw",
    config: loadMatchingConfig({}),
    wakeScorer: () => {
      wakes++;
    },
  };
});
afterEach(() => t.cleanup());

const refused = (fn: () => unknown, code: string, status: number) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ code, statusCode: status });
    return e as AppError;
  }
  throw new Error(`expected ${code}`);
};

describe("getSettings", () => {
  it("starts with no profile, version 0, the $5 cap, nothing spent, notice not agreed (AC-15, AC-20)", () => {
    expect(getSettings(deps)).toEqual({
      profile: null,
      profileVersion: 0,
      capUsdCents: 500,
      spentUsdCents: 0,
      noticeAgreedAt: null,
    });
  });

  it("reports this month's spend rounded up to the cent", () => {
    seedSpend(t.db, [
      { startedAt: Date.UTC(2026, 9, 5), reservedUsdMicros: 4_980_001, settledUsdMicros: 4_980_001 },
      { startedAt: Date.UTC(2026, 8, 25), reservedUsdMicros: 3_000_000, settledUsdMicros: 3_000_000 },
    ]);
    expect(getSettings(deps).spentUsdCents).toBe(499);
  });
});

describe("saveProfile (AC-10, AC-16, AC-20, AC-21)", () => {
  it("refuses a save before the notice is agreed, and saves nothing (AC-20 guard)", () => {
    refused(() => saveProfile(deps, AC01_PROFILE), "MATCHING_NOTICE_NOT_AGREED", 409);
    expect(readSettings(t.db).profile).toBe(null);
    expect(wakes).toBe(0);
  });

  it("saves a first profile by hand: version 0 → 1 and the scorer is woken (AC-21)", () => {
    agreeNotice(deps);
    const r = saveProfile(deps, AC01_PROFILE);
    expect(r.changed).toBe(true);
    expect(r.settings).toMatchObject({ profile: AC01_PROFILE, profileVersion: 1 });
    expect(readSettings(t.db).profileSavedAt).toBe(NOW);
    expect(wakes).toBe(1);
  });

  it("bumps the version on a real change, senior → staff, and wakes the scorer (AC-10)", () => {
    seedProfile(t.db, { profileVersion: 3 });
    const r = saveProfile(deps, { ...AC01_PROFILE, seniority: "staff" });
    expect(r).toMatchObject({ changed: true, settings: { profileVersion: 4 } });
    expect(wakes).toBe(1);
  });

  it("makes nothing stale when nothing changed (AC-10 note)", () => {
    seedProfile(t.db, { profileVersion: 3 });
    const reordered: Profile = { ...AC01_PROFILE, roleTypes: ["fullstack", "backend"] };
    const r = saveProfile(deps, reordered);
    expect(r).toMatchObject({ changed: false, settings: { profileVersion: 3 } });
    expect(wakes).toBe(0);
  });

  it("refuses an invalid field with its message, and changes nothing (AC-16)", () => {
    seedProfile(t.db, { profileVersion: 3 });
    const e = refused(
      () => saveProfile(deps, { ...AC01_PROFILE, skills: [{ name: "React", core: false }] }),
      "MATCHING_INVALID_PROFILE",
      400,
    );
    expect(e.message).toBe("Skills: mark at least one skill as core.");
    expect(readSettings(t.db)).toMatchObject({ profile: AC01_PROFILE, profileVersion: 3 });
  });

  it("refuses a contact detail anywhere in the profile (AC-09, AC-16)", () => {
    agreeNotice(deps);
    const e = refused(
      () =>
        saveProfile(deps, {
          ...AC01_PROFILE,
          skills: [...AC01_PROFILE.skills, { name: "user-0001@example.test", core: false }],
        }),
      "MATCHING_INVALID_PROFILE",
      400,
    );
    expect(e.message).toContain("no contact details");
  });
});

describe("agreeNotice (AC-20)", () => {
  it("records the agreement once", () => {
    expect(agreeNotice(deps)).toEqual({ noticeAgreedAt: NOW });
    deps.now = () => NOW + 1000;
    expect(agreeNotice(deps)).toEqual({ noticeAgreedAt: NOW });
  });
});

describe("setCap (AC-19)", () => {
  beforeEach(() => {
    seedProfile(t.db);
    seedSpend(t.db, [
      { startedAt: Date.UTC(2026, 9, 5), reservedUsdMicros: 5_000_000, settledUsdMicros: 5_000_000 },
    ]);
  });

  it("raising $5 → $8 after stopping at $5 wakes the scorer", () => {
    expect(setCap(deps, 800)).toMatchObject({ capUsdCents: 800, spentUsdCents: 500 });
    expect(readSettings(t.db).capUsdMicros).toBe(8_000_000);
    expect(wakes).toBe(1);
  });

  it("a cap at or below the spend, or $0, is saved but wakes nothing", () => {
    setCap(deps, 400);
    setCap(deps, 500);
    setCap(deps, 0);
    expect(readSettings(t.db).capUsdMicros).toBe(0);
    expect(wakes).toBe(0);
  });

  it("makes no score stale", () => {
    const before = readSettings(t.db).profileVersion;
    setCap(deps, 800);
    expect(readSettings(t.db).profileVersion).toBe(before);
  });

  it("refuses a cap outside $0–$100 or not whole cents", () => {
    refused(() => setCap(deps, 10_001), "VALIDATION_ERROR", 400);
    refused(() => setCap(deps, -1), "VALIDATION_ERROR", 400);
    refused(() => setCap(deps, 1.5), "VALIDATION_ERROR", 400);
    expect(readSettings(t.db).capUsdMicros).toBe(5_000_000);
  });
});
