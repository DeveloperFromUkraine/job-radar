// The owner's profile: fixed lists, field checks (AC-16), contact detection (AC-09), change detection
// (AC-10) and salary periods (api-sync-report F-6). Pure.

export const SENIORITIES = ["junior", "mid", "senior", "lead", "staff", "principal"] as const;
export const ROLE_TYPES = [
  "backend",
  "frontend",
  "fullstack",
  "mobile",
  "devops_sre",
  "data",
  "ml_ai",
  "qa",
  "security",
  "engineering_management",
] as const;
export const ENGAGEMENT_FORMS = ["employment", "b2b", "contract_freelance"] as const;
export const PERIODS = ["hour", "day", "month", "year"] as const;

export const MAX_PROFILE_SKILL_LENGTH = 50;
export const MAX_PROFILE_SKILLS = 50;
export const MAX_YEARS = 60;

export type Seniority = (typeof SENIORITIES)[number];
export type RoleType = (typeof ROLE_TYPES)[number];
export type EngagementForm = (typeof ENGAGEMENT_FORMS)[number];
export type Period = (typeof PERIODS)[number];

export interface ProfileSkill {
  name: string;
  core: boolean;
}

export interface MinSalary {
  amount: number;
  currency: string;
  period: Period;
}

export interface Profile {
  skills: ProfileSkill[];
  years: number | null;
  seniority: Seniority | null;
  roleTypes: RoleType[];
  minSalary: MinSalary | null;
  engagementForms: EngagementForm[];
}

export type ProfileField = keyof Profile;
export interface FieldError {
  field: ProfileField;
  message: string;
}

// ---- Contact details (AC-09, AC-16) ------------------------------------------------------------

export type ContactKind = "name" | "email" | "phone" | "address" | "link";
export interface ContactDetail {
  kind: ContactKind;
  text: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// A scheme or "www." is required, or a known profile host: a bare "Node.js/TS" is a skill, not a link.
const LINK =
  /\b(?:https?:\/\/[^\s,;·]+|www\.[^\s,;·]+|(?:linkedin\.com|github\.com|gitlab\.com|x\.com|twitter\.com)\/[^\s,;·]+)/gi;
// An international number, or three groups of digits; "10,000" and "2019-2024" are not phones.
const PHONE =
  /(?:\+\d{1,3}[\s.-]?(?:\(\d+\)[\s.-]?)?\d{2,4}(?:[\s.-]\d{2,4}){1,4})|\b\d{3}[\s.-]\d{3}[\s.-]\d{3,4}\b/g;
const ADDRESS =
  /\b\d{1,5}[A-Za-z]?\s+(?:[A-Z][\p{L}'-]+\s+){1,3}(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Lane|Boulevard|Blvd\.|Way|Drive|Square)|\b(?:ul\.|ulica|al\.|aleja)\s+[\p{L}'-]+(?:\s+[\p{L}'-]+)?\s+\d{1,5}[A-Za-z]?(?:\/\d+)?/gu;

const KIND_WORDS: Record<Exclude<ContactKind, "name">, string> = {
  email: "the email address",
  phone: "the phone number",
  address: "the address",
  link: "the web address",
};

export function findContactDetails(text: string): ContactDetail[] {
  const found: ContactDetail[] = [];
  const seen = new Set<string>();
  const add = (kind: ContactKind, value: string) => {
    const t = value.trim();
    if (t && !seen.has(`${kind}:${t}`)) {
      seen.add(`${kind}:${t}`);
      found.push({ kind, text: t });
    }
  };
  // Emails first, so a link scan does not report the domain part of an address.
  const withoutEmails = text.replace(EMAIL, (m) => {
    add("email", m);
    return " ";
  });
  for (const m of withoutEmails.matchAll(LINK)) add("link", m[0].replace(/[.)]+$/, ""));
  const rest = withoutEmails.replace(LINK, " ");
  for (const m of rest.matchAll(PHONE)) add("phone", m[0]);
  for (const m of rest.matchAll(ADDRESS)) add("address", m[0]);
  return found;
}

const NAME_LINE = /^\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){1,3}$/u;
const NOT_A_NAME = new Set([
  "curriculum",
  "vitae",
  "resume",
  "résumé",
  "cv",
  "profile",
  "senior",
  "software",
]);

/** The CV's first non-empty line when it looks like a person's name (2–4 capitalised words). */
export function cvHeaderName(cvText: string): string | null {
  const first = cvText
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!first || !NAME_LINE.test(first)) return null;
  if (first.split(/\s+/).some((w) => NOT_A_NAME.has(w.toLowerCase()))) return null;
  return first;
}

// ---- Validation (AC-16) ------------------------------------------------------------------------

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export function validateProfile(p: Profile): FieldError[] {
  const errors: FieldError[] = [];
  const fail = (field: ProfileField, message: string) => errors.push({ field, message });

  const skills = Array.isArray(p.skills) ? p.skills : [];
  const contact = skills.flatMap((s) => (typeof s.name === "string" ? findContactDetails(s.name) : []))[0];
  if (contact && contact.kind !== "name") {
    fail("skills", `Skills: remove ${KIND_WORDS[contact.kind]}; a profile holds no contact details.`);
  } else if (skills.some((s) => typeof s.name !== "string" || s.name.trim() === "")) {
    fail("skills", "Skills: give every skill a name or remove it.");
  } else if (skills.some((s) => s.name.trim().length > MAX_PROFILE_SKILL_LENGTH)) {
    fail("skills", `Skills: use up to ${MAX_PROFILE_SKILL_LENGTH} characters per skill.`);
  } else if (skills.length > MAX_PROFILE_SKILLS) {
    fail("skills", `Skills: list up to ${MAX_PROFILE_SKILLS} skills.`);
  } else if (!skills.some((s) => s.core === true)) {
    fail("skills", "Skills: mark at least one skill as core.");
  }

  if (p.years !== null && (!Number.isInteger(p.years) || p.years < 0 || p.years > MAX_YEARS)) {
    fail("years", `Years of experience: use a whole number from 0 to ${MAX_YEARS}.`);
  }
  if (p.seniority !== null && !isOneOf(SENIORITIES, p.seniority)) {
    fail("seniority", `Seniority: choose one of ${SENIORITIES.join(", ")}.`);
  }
  if (!Array.isArray(p.roleTypes) || p.roleTypes.some((r) => !isOneOf(ROLE_TYPES, r))) {
    fail("roleTypes", "Role types: choose only from the listed role types.");
  }
  if (!Array.isArray(p.engagementForms) || p.engagementForms.some((f) => !isOneOf(ENGAGEMENT_FORMS, f))) {
    fail("engagementForms", "Engagement forms: choose only employment, B2B or contract/freelance.");
  }

  const s = p.minSalary;
  if (s !== null) {
    if (typeof s.amount !== "number" || !Number.isInteger(s.amount) || s.amount < 0) {
      fail("minSalary", "Minimum salary: use a whole number of 0 or more.");
    } else if (
      typeof s.currency !== "string" ||
      !/^[A-Z]{3}$/.test(s.currency) ||
      !isOneOf(PERIODS, s.period)
    ) {
      fail("minSalary", "Minimum salary: choose a currency and a period.");
    }
  }
  return errors;
}

// ---- Change detection (AC-10 note) -------------------------------------------------------------

function canonical(p: Profile): string {
  return JSON.stringify({
    skills: p.skills
      .map((s) => ({ name: s.name.trim(), core: s.core }))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    years: p.years,
    seniority: p.seniority,
    roleTypes: [...p.roleTypes].sort(),
    minSalary: p.minSalary,
    engagementForms: [...p.engagementForms].sort(),
  });
}

/** Only a profile field change makes scores stale; the cap and list order do not. */
export function profileChanged(before: Profile | null, after: Profile): boolean {
  return before === null || canonical(before) !== canonical(after);
}

// ---- Salary periods (F-6) ----------------------------------------------------------------------

// ponytail: fixed working-time factors (8 h a day, 21 days a month); per-country calendars if it matters.
const HOURS: Record<Period, number> = { hour: 1, day: 8, month: 168, year: 2016 };

export function toPeriod(amount: number, from: Period, to: Period): number {
  return (amount * HOURS[to]) / HOURS[from]; // a rate: 60 per hour is 480 per day
}
