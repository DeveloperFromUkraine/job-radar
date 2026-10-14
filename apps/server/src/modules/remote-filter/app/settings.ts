// The owner's country, the filter's on/off state and the one-off look (sad §4; spec AC-04 – AC-07, AC-13).
// A look counts only within the visit it was started in: search passes its visit start, so a new visit
// ends it with no clean-up job (data-model look_started_at).
import { readSettings, writeCountry, writeFilterOn, writeLook } from "../infra/repo.js";
import { type Country, countries, countryByCode, lookup } from "./countries.js";
import type { RemoteFilterDeps } from "./deps.js";

export interface RemoteFilterSettings {
  country: Country | null;
  filterOn: boolean;
  countries: Country[];
}

export type FilterMode = "none" | "own" | "look" | "off";
export interface ActiveFilter {
  mode: FilterMode;
  country: Country | null;
}

const byCode = (code: string | null) => (code ? (countryByCode(code) ?? null) : null);

export function getSettings({ db }: RemoteFilterDeps): RemoteFilterSettings {
  const row = readSettings(db);
  return { country: byCode(row.country), filterOn: row.filterOn, countries: countries() };
}

/** Saves the country and switches the filter on (AC-13); a look in progress is left as it is. */
export function chooseCountry(deps: RemoteFilterDeps, name: string): RemoteFilterSettings {
  writeCountry(deps.db, lookup(name).code, true);
  return getSettings(deps);
}

/** Switching during a look does not end the look. */
export function setFilterOn(deps: RemoteFilterDeps, on: boolean): RemoteFilterSettings {
  writeFilterOn(deps.db, on);
  return getSettings(deps);
}

/** Starts a look at another country, or ends it with null; never touches the owner's own settings. */
export function setLook(deps: RemoteFilterDeps, name: string | null): { look: Country | null } {
  const look = name === null ? null : lookup(name);
  writeLook(deps.db, look?.code ?? null, look ? deps.now() : null);
  return { look };
}

/** The filter a list built in the visit that started at `visitStartedAt` uses. */
export function activeFilter({ db }: RemoteFilterDeps, visitStartedAt: number): ActiveFilter {
  const row = readSettings(db);
  if (row.lookCountry && row.lookStartedAt !== null && row.lookStartedAt >= visitStartedAt) {
    return { mode: "look", country: byCode(row.lookCountry) };
  }
  const country = byCode(row.country);
  if (!country) return { mode: "none", country: null };
  return { mode: row.filterOn ? "own" : "off", country };
}
