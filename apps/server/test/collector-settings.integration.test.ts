import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/modules/collector/domain/settings.js";
import { readState } from "../src/modules/collector/infra/repo/state.js";
import { loadSettings, settingsPathFor } from "../src/modules/collector/infra/settings.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const NOW = Date.UTC(2026, 9, 2, 12);

describe("settings file (AC-27)", () => {
  let db: TempDb;
  let dir: string;
  let file: string;

  beforeEach(() => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-settings-"));
    file = join(dir, "settings.json");
  });

  afterEach(() => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const owned = {
    sources: {
      ...DEFAULT_SETTINGS.sources,
      jobicy: { enabled: false, categories: ["Software Engineering"] },
    },
  };

  it("lives beside the database file", () => {
    expect(settingsPathFor("/x/data/job-radar.sqlite")).toBe("/x/data/settings.json");
  });

  it("creates a missing file with the built-in defaults and says defaults are in use", () => {
    const result = loadSettings(db.db, file, NOW);

    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(DEFAULT_SETTINGS);
    expect(readState(db.db)).toMatchObject({ settingsNotice: "defaults_in_use", settingsProblem: null });
  });

  it("uses a valid file, stores it as the last valid copy and clears the notice", () => {
    writeFileSync(file, JSON.stringify(owned));

    const result = loadSettings(db.db, file, NOW);

    expect(result.settings).toEqual(owned);
    const state = readState(db.db);
    expect(JSON.parse(state.lastValidSettings ?? "null")).toEqual(owned);
    expect(state).toMatchObject({ lastValidSettingsAt: NOW, settingsNotice: null, settingsProblem: null });
  });

  it("keeps collection on the last valid copy when the file becomes unreadable", () => {
    writeFileSync(file, JSON.stringify(owned));
    loadSettings(db.db, file, NOW);
    writeFileSync(file, '{ "sources": ');

    const result = loadSettings(db.db, file, NOW + 1);

    expect(result.settings).toEqual(owned);
    expect(readState(db.db)).toMatchObject({
      settingsProblem: "The settings file is not valid JSON.",
      settingsProblemAt: NOW + 1,
    });
  });

  it("runs on the defaults without overwriting an unreadable file when no valid copy exists", () => {
    writeFileSync(file, '{ "sources": { "remoteok": {} } }');

    const result = loadSettings(db.db, file, NOW);

    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(readFileSync(file, "utf8")).toBe('{ "sources": { "remoteok": {} } }');
    expect(readState(db.db).settingsProblem).toMatch(/unknown source "remoteok"/);
  });

  it("clears the problem after the next valid read", () => {
    writeFileSync(file, "nope");
    loadSettings(db.db, file, NOW);
    writeFileSync(file, JSON.stringify(owned));

    loadSettings(db.db, file, NOW + 1);

    expect(readState(db.db)).toMatchObject({ settingsProblem: null, settingsProblemAt: null });
  });

  it("keeps the last valid copy across a restart (a new database handle on the same file)", () => {
    writeFileSync(file, JSON.stringify(owned));
    loadSettings(db.db, file, NOW);
    writeFileSync(file, "nope");

    const restarted = createTempDb();
    try {
      expect(loadSettings(restarted.db, file, NOW).settings).toEqual(DEFAULT_SETTINGS); // fresh DB: no copy yet
    } finally {
      restarted.cleanup();
    }
    expect(loadSettings(db.db, file, NOW).settings).toEqual(owned);
    expect(existsSync(file)).toBe(true);
  });
});
