// Realness signals and penalty (spec AC-01, AC-02, AC-07 – AC-09; sad.md §4 Penalty rule, Signal
// definitions). Pure: the caller passes the clock and the owner's time zone.

// The fixed rule (spec §3: no tuning; revisit after the §7 hand check, sad.md §11).
export const AGE_DAYS = 30;
export const OLD_DAYS = 60;
export const AGE_POINTS = 10;
export const OLD_POINTS = 20;
export const MANY_BOARDS = 3;
export const MANY_BOARDS_DAYS = 45;
export const MANY_BOARDS_POINTS = 15;
export const REPOST_POINTS = 10;
export const NO_SALARY_POINTS = 5;
export const PENALTY_CAP = 30;
export const REPOST_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export type RealnessSignal =
  | { kind: "age"; basis: "posted" | "first_found"; days: number }
  | { kind: "many_boards"; boards: number; days: number }
  | { kind: "repost" }
  | { kind: "no_salary" };

export interface Realness {
  penalty: number;
  signals: RealnessSignal[];
}

export interface RealnessFacts {
  publishedAt: number | null;
  firstFoundAt: number;
  /** Distinct enabled sources with an open listing for the posting. */
  enabledOpenBoards: number;
  /** The collector reopened it since realness-score shipped. */
  reopened: boolean;
  repostByLookAlike: boolean;
  noSalary: boolean;
}

interface Timed {
  publishedAt: number | null;
  firstFoundAt: number;
}

/** Search's effective time: publication time, never later than first found. */
export const effectiveTime = ({ publishedAt, firstFoundAt }: Timed) =>
  publishedAt === null ? firstFoundAt : Math.min(publishedAt, firstFoundAt);

// Building an Intl formatter is costly; a list build asks for two days per posting.
const formatters = new Map<string, Intl.DateTimeFormat>();
const dayNumber = (at: number, timeZone: string) => {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, format);
  }
  const day = format.format(at).split("-").map(Number) as [number, number, number];
  return Date.UTC(day[0], day[1] - 1, day[2]) / (24 * 60 * 60 * 1000);
};

/** Whole calendar days in `timeZone` between `time` and `now`. */
export function daysAgo(time: number, now: number, timeZone: string): number {
  return dayNumber(now, timeZone) - dayNumber(time, timeZone);
}

/**
 * A look-alike repost: an earlier closed copy (same look-alike key, passed by the caller) more than 7 days
 * before this one, and no earlier copy still open (parallel hires).
 */
export function repostByLookAlike(
  posting: Timed,
  sameKey: readonly (Timed & { status: "open" | "closed" })[],
) {
  const mine = effectiveTime(posting);
  const earlier = sameKey.filter((p) => effectiveTime(p) < mine);
  if (earlier.some((p) => p.status === "open")) return false;
  return earlier.some((p) => p.status === "closed" && mine - effectiveTime(p) > REPOST_GAP_MS);
}

export function realnessOf(facts: RealnessFacts, now: number, timeZone: string): Realness {
  const signals: RealnessSignal[] = [];
  let penalty = 0;

  const ageDays = daysAgo(effectiveTime(facts), now, timeZone);
  const agePoints = ageDays >= OLD_DAYS ? OLD_POINTS : ageDays >= AGE_DAYS ? AGE_POINTS : 0;
  const foundDays = daysAgo(facts.firstFoundAt, now, timeZone);
  const boardsPoints =
    facts.enabledOpenBoards >= MANY_BOARDS && foundDays >= MANY_BOARDS_DAYS ? MANY_BOARDS_POINTS : 0;
  if (boardsPoints > agePoints) {
    signals.push({ kind: "many_boards", boards: facts.enabledOpenBoards, days: foundDays });
    penalty += boardsPoints;
  } else if (agePoints > 0) {
    const posted = facts.publishedAt !== null && facts.publishedAt <= facts.firstFoundAt;
    signals.push({ kind: "age", basis: posted ? "posted" : "first_found", days: ageDays });
    penalty += agePoints;
  }
  if (facts.reopened || facts.repostByLookAlike) {
    signals.push({ kind: "repost" });
    penalty += REPOST_POINTS;
  }
  if (facts.noSalary) {
    signals.push({ kind: "no_salary" });
    penalty += NO_SALARY_POINTS;
  }
  return { penalty: Math.min(PENALTY_CAP, penalty), signals };
}
