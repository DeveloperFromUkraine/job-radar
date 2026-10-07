// The owner's settings file (sad §5, AC-27): re-read at the start of every run, a valid copy kept in
// the database so an unreadable file keeps collection on the last valid settings, even after a restart.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { Db } from "../../../core/db.js";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "../domain/settings.js";
import { readState, updateState } from "./repo/state.js";

export function settingsPathFor(databaseFile: string): string {
  return join(dirname(databaseFile), "settings.json");
}

export interface LoadedSettings {
  settings: Settings;
  from: "file" | "created" | "last_valid" | "defaults";
}

export function loadSettings(db: Db, file: string, now: number): LoadedSettings {
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(DEFAULT_SETTINGS, null, 2)}\n`);
    storeValid(db, DEFAULT_SETTINGS, now);
    return { settings: DEFAULT_SETTINGS, from: "created" };
  }

  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return fallBack(db, "The settings file could not be opened.", now);
  }
  const parsed = parseSettings(text);
  if (!parsed.ok) return fallBack(db, parsed.reason, now);

  storeValid(db, parsed.settings, now);
  return { settings: parsed.settings, from: "file" };
}

function storeValid(db: Db, settings: Settings, now: number): void {
  updateState(db, {
    lastValidSettings: JSON.stringify(settings),
    lastValidSettingsAt: now,
    settingsNotice: isDeepStrictEqual(settings, DEFAULT_SETTINGS) ? "defaults_in_use" : null,
    settingsProblem: null,
    settingsProblemAt: null,
  });
}

// Unreadable: never overwrite the owner's file; run on the last valid copy, else the built-in defaults.
function fallBack(db: Db, reason: string, now: number): LoadedSettings {
  const { lastValidSettings, settingsProblem, settingsProblemAt } = readState(db);
  updateState(db, {
    settingsProblem: reason,
    settingsProblemAt: settingsProblem === reason ? settingsProblemAt : now,
  });
  if (lastValidSettings) {
    const copy = parseSettings(lastValidSettings);
    if (copy.ok) return { settings: copy.settings, from: "last_valid" };
  }
  return { settings: DEFAULT_SETTINGS, from: "defaults" };
}
