// Drafting a profile from a CV (sad.md §6 flows 3, 5; ADR-0006, ADR-0007). The CV is read locally, its
// name line and contact details are removed before anything leaves the machine, the draft's largest
// possible cost is reserved first, and nothing is stored: the CV, its text and the draft live only in
// this call (AC-07). The owner confirms the draft with saveProfile.
import { AppError } from "../../../core/errors.js";
import {
  type ContactDetail,
  cvHeaderName,
  ENGAGEMENT_FORMS,
  type EngagementForm,
  findContactDetails,
  PERIODS,
  type Period,
  type Profile,
  ROLE_TYPES,
  type RoleType,
  type Seniority,
} from "../domain/profile.js";
import { maxCostMicros, monthWindow, settledCostMicros } from "../domain/spend.js";
import { createClaudeProvider } from "../infra/claude.js";
import { extractCvText } from "../infra/cv-text.js";
import { draftRequest, requestBytes } from "../infra/prompts.js";
import * as repo from "../infra/repo.js";
import type { MatchingDeps } from "./deps.js";
import { requireNotice } from "./settings.js";

type FieldSource = "from_cv" | "not_found";
export interface CvDraftView {
  draft: Profile;
  fieldSources: Record<keyof Profile, FieldSource>;
  notMapped: { field: "seniority" | "role_types" | "engagement_forms"; value: string }[];
  removed: ContactDetail[];
  current: Profile | null;
}

const resumeDay = (resumesOn: string) =>
  new Date(`${resumesOn}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export const PROVIDER_UNAVAILABLE =
  "The language-model provider can't be reached right now. Try again later; your profile is unchanged.";
export const KEY_PROBLEM =
  "No valid provider key is set up. Set one in your local configuration and restart job-radar.";
const DRAFT_UNUSABLE =
  "The draft could not be made from this CV. Try again later, or fill in the profile by hand.";

export async function draftProfileFromCv(
  deps: MatchingDeps,
  file: { mediaType: string; bytes: Uint8Array },
): Promise<CvDraftView> {
  requireNotice(deps);
  const extracted = await extractCvText(file);
  if (!extracted.ok) throw new AppError(extracted.code, extracted.message, extracted.status);

  // Contact details leave the text before anything is sent (AC-09).
  const removed: ContactDetail[] = [];
  let text = extracted.text;
  const name = cvHeaderName(text);
  if (name) {
    removed.push({ kind: "name", text: name });
    text = text.replaceAll(name, " ");
  }
  for (const d of findContactDetails(text)) {
    removed.push(d);
    text = text.replaceAll(d.text, " ");
  }

  const { config: cfg } = deps;
  const params = draftRequest(cfg, text);
  const window = monthWindow(deps.now(), deps.timeZone);
  const reservation = repo.reserve(deps.db, {
    kind: "draft",
    postingId: null,
    model: cfg.model,
    cost: maxCostMicros(requestBytes(params), cfg.draftOutputLimit, cfg.price),
    cap: repo.readSettings(deps.db).capUsdMicros,
    monthStart: window.start,
    at: deps.now(),
  });
  if (!reservation.ok) {
    throw new AppError(
      "MATCHING_CAP_REACHED",
      `This month's scoring cap is reached, so the draft can't be made. It can be made again from ${resumeDay(window.resumesOn)}, or after you raise the cap.`,
      409,
    );
  }

  const outcome = await (deps.provider ?? createClaudeProvider(cfg)).send(params);
  if (outcome.kind === "problem") {
    repo.markNoAnswer(deps.db, reservation.id, deps.now());
    deps.log?.warn(
      { module: "matching", kind: "draft", problem: outcome.problem, detail: outcome.detail },
      "draft",
    );
    const key = outcome.problem === "key_missing" || outcome.problem === "key_refused";
    throw new AppError(
      key ? "MATCHING_KEY_PROBLEM" : "MATCHING_PROVIDER_UNAVAILABLE",
      key ? KEY_PROBLEM : PROVIDER_UNAVAILABLE,
      503,
    );
  }

  const mapped = mapDraft(outcome.answer);
  const cost = settledCostMicros(outcome.usage, cfg.price);
  repo.settle(deps.db, reservation.id, {
    outcome: mapped ? "answered" : "unusable",
    cost,
    usage: outcome.usage,
    at: deps.now(),
  });
  deps.log?.info(
    { module: "matching", kind: "draft", outcome: mapped ? "answered" : "unusable", cost },
    "draft",
  );
  if (!mapped) throw new AppError("MATCHING_DRAFT_UNUSABLE", DRAFT_UNUSABLE, 502);

  return { ...mapped, removed: [...removed, ...mapped.removed], current: repo.readSettings(deps.db).profile };
}

// ---- The model's draft → the fixed lists (CONTEXT: Profile) ------------------------------------

const SENIORITY_WORDS: [RegExp, Seniority][] = [
  [/\bprincipal\b/, "principal"],
  [/\bstaff\b/, "staff"],
  [/\b(lead|tech lead|team lead)\b/, "lead"],
  [/\b(senior|sr\.?)\b/, "senior"],
  [/\b(mid|middle|intermediate|regular)\b/, "mid"],
  [/\b(junior|jr\.?|entry)\b/, "junior"],
];
const ROLE_WORDS: [RegExp, RoleType][] = [
  [/full[\s-]?stack/, "fullstack"],
  [/back[\s-]?end/, "backend"],
  [/front[\s-]?end/, "frontend"],
  [/\b(mobile|ios|android)\b/, "mobile"],
  [/\b(devops|sre|site reliability|platform|infrastructure)\b/, "devops_sre"],
  [/\b(ml|ai|machine learning)\b/, "ml_ai"],
  [/\bdata\b/, "data"],
  [/\b(qa|quality|test)/, "qa"],
  [/\bsecurity\b/, "security"],
  [/\b(engineering manager|management|head of engineering)\b/, "engineering_management"],
];
const FORM_WORDS: [RegExp, EngagementForm][] = [
  [/\bb2b\b/, "b2b"],
  [/\b(contract|contractor|freelance|freelancer)\b/, "contract_freelance"],
  [/\b(employment|employee|permanent|full[\s-]?time)\b/, "employment"],
];

const firstMatch = <T>(words: [RegExp, T][], value: string): T | null =>
  words.find(([re]) => re.test(value.toLowerCase()))?.[1] ?? null;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim())
    : [];

/** The untrusted draft as a Profile with provenance, or null when it has no usable shape. */
function mapDraft(raw: unknown): Omit<CvDraftView, "current"> | null {
  if (!isRecord(raw) || raw.refusal === true || raw.invalid === true || !Array.isArray(raw.skills))
    return null;
  const notMapped: CvDraftView["notMapped"] = [];
  const removed: ContactDetail[] = [];

  const seen = new Set<string>();
  const skills: Profile["skills"] = [];
  for (const s of raw.skills) {
    if (!isRecord(s) || typeof s.name !== "string" || !s.name.trim()) continue;
    const name = s.name.trim().slice(0, 50);
    const contact = findContactDetails(name);
    if (contact.length) {
      removed.push(...contact); // AC-09: a contact detail among the skills is removed and listed
      continue;
    }
    if (seen.has(name.toLowerCase()) || skills.length >= 50) continue;
    seen.add(name.toLowerCase());
    skills.push({ name, core: s.core === true });
  }

  const years =
    typeof raw.years === "number" && Number.isInteger(raw.years) && raw.years >= 0 && raw.years <= 60
      ? raw.years
      : null;

  let seniority: Seniority | null = null;
  if (typeof raw.seniority === "string" && raw.seniority.trim()) {
    seniority = firstMatch(SENIORITY_WORDS, raw.seniority);
    if (!seniority) notMapped.push({ field: "seniority", value: raw.seniority.trim() });
  }

  const roleTypes: RoleType[] = [];
  for (const value of strings(raw.role_types)) {
    const r = firstMatch(ROLE_WORDS, value);
    if (!r) notMapped.push({ field: "role_types", value });
    else if (!roleTypes.includes(r) && (ROLE_TYPES as readonly string[]).includes(r)) roleTypes.push(r);
  }

  const engagementForms: EngagementForm[] = [];
  for (const value of strings(raw.engagement_forms)) {
    const f = firstMatch(FORM_WORDS, value);
    if (!f) notMapped.push({ field: "engagement_forms", value });
    else if (!engagementForms.includes(f) && (ENGAGEMENT_FORMS as readonly string[]).includes(f))
      engagementForms.push(f);
  }

  let minSalary: Profile["minSalary"] = null;
  const s = raw.min_salary;
  if (isRecord(s) && typeof s.amount === "number" && Number.isInteger(s.amount) && s.amount >= 0) {
    const currency = typeof s.currency === "string" ? s.currency.trim().toUpperCase() : "";
    const period = typeof s.period === "string" ? s.period.trim().toLowerCase() : "";
    if (/^[A-Z]{3}$/.test(currency) && (PERIODS as readonly string[]).includes(period))
      minSalary = { amount: s.amount, currency, period: period as Period };
  }

  const draft: Profile = { skills, years, seniority, roleTypes, minSalary, engagementForms };
  const found = (v: unknown) =>
    v === null || (Array.isArray(v) && v.length === 0) ? "not_found" : "from_cv";
  return {
    draft,
    fieldSources: {
      skills: found(skills),
      years: found(years),
      seniority: found(seniority),
      roleTypes: found(roleTypes),
      minSalary: found(minSalary),
      engagementForms: found(engagementForms),
    },
    notMapped,
    removed,
  };
}
