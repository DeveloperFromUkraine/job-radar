// Typed client for the remote-filter API (docs/features/remote-filter/contracts/openapi.yaml).
import { post, request } from "./collector";

export interface Country {
  /** ISO 3166-1 alpha-2 (XK for Kosovo). */
  code: string;
  name: string;
  flag: string;
}

export interface RemoteFilterSettings {
  /** null = not chosen yet (AC-04). */
  country: Country | null;
  filter_on: boolean;
  /** The one list the chooser and the filter share, ordered by name. */
  countries: Country[];
}

/** The filter a list was built with (SearchResult.location_filter). */
export interface LocationFilter {
  mode: "none" | "own" | "look" | "off";
  country: Country | null;
}

/** Why a shown posting carries "check location" (AC-02). */
export type LocationCheck = "exception" | "hours_only" | "not_recognised" | "not_stated";

export interface LookState {
  look: Country | null;
}

const base = "/api/v1/remote-filter";

export const getRemoteFilterSettings = () => request<RemoteFilterSettings>(`${base}/settings`);
/** Saves the owner's country and switches the filter on (AC-13); 400 REMOTE_FILTER_UNKNOWN_COUNTRY (AC-05). */
export const chooseCountry = (name: string) => post<RemoteFilterSettings>(`${base}/country`, { name });
export const setFilterOn = (on: boolean) => post<RemoteFilterSettings>(`${base}/filter`, { on });
/** Starts a one-off look, or ends it with null (AC-06). */
export const setLook = (name: string | null) => post<LookState>(`${base}/look`, { name });
