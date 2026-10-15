// The profile screen's use cases (sad.md §6 flows 4, 6): read the settings, save the profile, agree to
// the one-time notice, set the cap. Only a real profile change makes scores stale (AC-10 note).
import { AppError } from "../../../core/errors.js";
import { type Profile, profileChanged, validateProfile } from "../domain/profile.js";
import { centsToMicros, monthWindow, toCentsUp } from "../domain/spend.js";
import * as repo from "../infra/repo.js";
import type { MatchingDeps } from "./deps.js";

export interface SettingsView {
  profile: Profile | null;
  profileVersion: number;
  capUsdCents: number;
  spentUsdCents: number;
  noticeAgreedAt: number | null;
}

export const NOTICE_NOT_AGREED =
  "Agree to the data notice before anything is sent to the language-model provider.";

export const monthSpent = (deps: MatchingDeps) =>
  repo.monthSpend(deps.db, monthWindow(deps.now(), deps.timeZone).start);

export function getSettings(deps: MatchingDeps): SettingsView {
  const s = repo.readSettings(deps.db);
  return {
    profile: s.profile,
    profileVersion: s.profileVersion,
    capUsdCents: Math.round(s.capUsdMicros / 10_000),
    spentUsdCents: toCentsUp(monthSpent(deps)),
    noticeAgreedAt: s.noticeAgreedAt,
  };
}

/** Nothing may be saved for sending, or sent, before the owner agrees once (AC-20). */
export function requireNotice(deps: MatchingDeps): void {
  if (repo.readSettings(deps.db).noticeAgreedAt === null)
    throw new AppError("MATCHING_NOTICE_NOT_AGREED", NOTICE_NOT_AGREED, 409);
}

export function saveProfile(
  deps: MatchingDeps,
  profile: Profile,
): { changed: boolean; settings: SettingsView } {
  requireNotice(deps);
  const [error] = validateProfile(profile);
  if (error) throw new AppError("MATCHING_INVALID_PROFILE", error.message, 400);
  const current = repo.readSettings(deps.db);
  const changed = profileChanged(current.profile, profile);
  if (changed) {
    repo.writeProfile(deps.db, profile, current.profileVersion + 1, deps.now());
    deps.wakeScorer();
  }
  return { changed, settings: getSettings(deps) };
}

export function agreeNotice(deps: MatchingDeps): { noticeAgreedAt: number } {
  repo.agreeNotice(deps.db, deps.now());
  return { noticeAgreedAt: repo.readSettings(deps.db).noticeAgreedAt as number };
}

export const MAX_CAP_CENTS = 10_000;

export function setCap(deps: MatchingDeps, capUsdCents: number): SettingsView {
  if (!Number.isInteger(capUsdCents) || capUsdCents < 0 || capUsdCents > MAX_CAP_CENTS)
    throw new AppError("VALIDATION_ERROR", "The cap must be whole cents from $0 to $100.", 400);
  const cap = centsToMicros(capUsdCents);
  repo.writeCap(deps.db, cap);
  if (cap > monthSpent(deps)) deps.wakeScorer(); // at or below the spend, scoring stays stopped (AC-19)
  return getSettings(deps);
}
