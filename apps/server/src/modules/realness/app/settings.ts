// The owner's realness switch (spec AC-10, AC-11).
import { AppError } from "../../../core/errors.js";
import { readRealnessOn, writeRealnessOn } from "../infra/repo.js";
import type { RealnessDeps } from "./deps.js";

export const isOn = (deps: Pick<RealnessDeps, "db">): boolean => readRealnessOn(deps.db);

export function setOn(deps: Pick<RealnessDeps, "db">, on: boolean): boolean {
  try {
    if (isOn(deps) !== on) writeRealnessOn(deps.db, on);
  } catch {
    throw new AppError(
      "REALNESS_SETTINGS_UNAVAILABLE",
      "Job-radar could not save your realness choice just now. Try again.",
      503,
    );
  }
  return on;
}
