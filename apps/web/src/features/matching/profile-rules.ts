// The AC-16 profile rules, checked before anything is sent (api-sync-report F-1). The server's
// matching/domain/profile.ts is the authority; both are tested against its profile-rule-cases.json
// table, so the wording and the cases stay the same on both sides.
import { ENGAGEMENT_FORMS, PERIODS, type Profile, ROLE_TYPES, SENIORITIES } from "../../api/matching";

export type ProfileField = keyof Profile;
export interface FieldError {
  field: ProfileField;
  message: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const LINK =
  /\b(?:https?:\/\/[^\s,;·]+|www\.[^\s,;·]+|(?:linkedin\.com|github\.com|gitlab\.com|x\.com|twitter\.com)\/[^\s,;·]+)/i;
const PHONE =
  /(?:\+\d{1,3}[\s.-]?(?:\(\d+\)[\s.-]?)?\d{2,4}(?:[\s.-]\d{2,4}){1,4})|\b\d{3}[\s.-]\d{3}[\s.-]\d{3,4}\b/;

function contactKind(text: string): string | null {
  if (EMAIL.test(text)) return "the email address";
  if (LINK.test(text)) return "the web address";
  if (PHONE.test(text)) return "the phone number";
  return null;
}

const isOneOf = (list: readonly string[], v: unknown) => typeof v === "string" && list.includes(v);

export function validateProfile(p: Profile): FieldError[] {
  const errors: FieldError[] = [];
  const fail = (field: ProfileField, message: string) => errors.push({ field, message });

  const skills = p.skills ?? [];
  const contact = skills.map((s) => (typeof s.name === "string" ? contactKind(s.name) : null)).find(Boolean);
  if (contact) fail("skills", `Skills: remove ${contact}; a profile holds no contact details.`);
  else if (skills.some((s) => typeof s.name !== "string" || s.name.trim() === ""))
    fail("skills", "Skills: give every skill a name or remove it.");
  else if (skills.some((s) => s.name.trim().length > 50))
    fail("skills", "Skills: use up to 50 characters per skill.");
  else if (skills.length > 50) fail("skills", "Skills: list up to 50 skills.");
  else if (!skills.some((s) => s.core === true)) fail("skills", "Skills: mark at least one skill as core.");

  if (p.years !== null && (!Number.isInteger(p.years) || p.years < 0 || p.years > 60))
    fail("years", "Years of experience: use a whole number from 0 to 60.");
  if (p.seniority !== null && !isOneOf(SENIORITIES, p.seniority))
    fail("seniority", `Seniority: choose one of ${SENIORITIES.join(", ")}.`);
  if (!Array.isArray(p.role_types) || p.role_types.some((r) => !isOneOf(ROLE_TYPES, r)))
    fail("role_types", "Role types: choose only from the listed role types.");
  if (!Array.isArray(p.engagement_forms) || p.engagement_forms.some((f) => !isOneOf(ENGAGEMENT_FORMS, f)))
    fail("engagement_forms", "Engagement forms: choose only employment, B2B or contract/freelance.");

  const s = p.min_salary;
  if (s !== null) {
    if (typeof s.amount !== "number" || !Number.isInteger(s.amount) || s.amount < 0)
      fail("min_salary", "Minimum salary: use a whole number of 0 or more.");
    else if (typeof s.currency !== "string" || !/^[A-Z]{3}$/.test(s.currency) || !isOneOf(PERIODS, s.period))
      fail("min_salary", "Minimum salary: choose a currency and a period.");
  }
  return errors;
}
