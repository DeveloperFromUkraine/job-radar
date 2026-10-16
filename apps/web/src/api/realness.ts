// Typed client for the realness API (docs/features/realness-score/contracts/openapi.yaml).
import { post } from "./collector";

export interface RealnessSettings {
  realness_on: boolean;
}

/** Saves the switch (AC-10); 503 REALNESS_SETTINGS_UNAVAILABLE when it cannot be saved (AC-11). */
export const setRealnessOn = (on: boolean) => post<RealnessSettings>("/api/v1/realness/settings", { on });
