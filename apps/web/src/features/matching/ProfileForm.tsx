// screens.md SCR-03 NEW: ProfileForm — the seven profile fields with field errors under each field,
// checked before sending (AC-16), live once flagged; follows SkillsField's error pattern.
import { type ReactNode, useId, useState } from "react";
import {
  ENGAGEMENT_FORMS,
  type EngagementForm,
  PERIODS,
  type Period,
  type Profile,
  ROLE_TYPES,
  type RoleType,
  SENIORITIES,
  type Seniority,
} from "../../api/matching";
import { Button } from "../../components/Button";
import { type FieldError, type ProfileField, validateProfile } from "./profile-rules";

const ROLE_LABELS: Record<RoleType, string> = {
  backend: "backend",
  frontend: "frontend",
  fullstack: "fullstack",
  mobile: "mobile",
  devops_sre: "devops/SRE",
  data: "data",
  ml_ai: "ML/AI",
  qa: "QA",
  security: "security",
  engineering_management: "engineering management",
};
const FORM_LABELS: Record<EngagementForm, string> = {
  employment: "employment",
  b2b: "B2B",
  contract_freelance: "contract/freelance",
};
const CURRENCIES = ["EUR", "USD", "GBP", "PLN", "CHF"];

interface FormState {
  skills: { name: string; core: boolean }[];
  years: string;
  seniority: string;
  roleTypes: RoleType[];
  amount: string;
  currency: string;
  period: string;
  forms: EngagementForm[];
}

function fromProfile(p: Profile | null): FormState {
  return {
    skills: p?.skills.length ? p.skills.map((s) => ({ ...s })) : [{ name: "", core: true }],
    years: p?.years === null || p?.years === undefined ? "" : String(p.years),
    seniority: p?.seniority ?? "",
    roleTypes: p?.role_types ?? [],
    amount: p?.min_salary ? String(p.min_salary.amount) : "",
    currency: p?.min_salary?.currency ?? "",
    period: p?.min_salary?.period ?? "",
    forms: p?.engagement_forms ?? [],
  };
}

const whole = (text: string) => (/^-?\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

export function toProfile(f: FormState): Profile {
  const salaryEmpty = f.amount.trim() === "" && f.currency === "" && f.period === "";
  return {
    skills: f.skills.map((s) => ({ name: s.name.trim(), core: s.core })),
    years: f.years.trim() === "" ? null : whole(f.years),
    seniority: f.seniority === "" ? null : (f.seniority as Seniority),
    role_types: f.roleTypes,
    min_salary: salaryEmpty
      ? null
      : { amount: whole(f.amount), currency: f.currency, period: f.period as Period },
    engagement_forms: f.forms,
  };
}

const input = "min-h-11 w-full min-w-0 rounded-card border border-border bg-surface px-3 text-text";
const choice = "inline-flex min-h-11 items-center gap-2";

function Errors({ id, errors }: { id: string; errors: FieldError[] }) {
  if (errors.length === 0) return null;
  return (
    <p id={id} className="text-sm text-danger">
      {errors.map((e) => e.message).join(" ")}
    </p>
  );
}

interface ProfileFormProps {
  initial: Profile | null;
  onSave: (profile: Profile) => void;
  saving?: boolean;
  /** Replaces the Save button, e.g. the one-time data notice (AC-20) or a server error. */
  footer?: ReactNode;
  /** Above the Save button: a server refusal or a save notice. */
  banner?: ReactNode;
}

export function ProfileForm({ initial, onSave, saving = false, footer, banner }: ProfileFormProps) {
  const id = useId();
  const [form, setForm] = useState<FormState>(() => fromProfile(initial));
  const [flagged, setFlagged] = useState(false);
  const errors = flagged ? validateProfile(toProfile(form)) : [];
  const errorsFor = (field: ProfileField) => errors.filter((e) => e.field === field);
  const describe = (field: ProfileField) =>
    errorsFor(field).length ? { "aria-invalid": true, "aria-describedby": `${id}-${field}-error` } : {};
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = () => {
    const profile = toProfile(form);
    setFlagged(true);
    if (validateProfile(profile).length === 0) onSave(profile);
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Skills</legend>
        {form.skills.map((s, i) => {
          const n = i + 1;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id; order is the owner's
            <div key={i} className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${id}-skill-${n}`} className="sr-only">
                Skill {n}
              </label>
              <input
                id={`${id}-skill-${n}`}
                type="text"
                value={s.name}
                maxLength={60}
                onChange={(e) =>
                  set({ skills: form.skills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                }
                className={`${input} flex-1`}
                {...describe("skills")}
              />
              {(["core", "nice-to-have"] as const).map((kind) => (
                <label key={kind} className={choice}>
                  <input
                    type="radio"
                    name={`${id}-skill-${n}-kind`}
                    aria-label={`Skill ${n} ${kind}`}
                    checked={s.core === (kind === "core")}
                    onChange={() =>
                      set({
                        skills: form.skills.map((x, j) => (j === i ? { ...x, core: kind === "core" } : x)),
                      })
                    }
                    className="size-5 accent-accent"
                  />
                  {kind === "core" ? "Core" : "Nice-to-have"}
                </label>
              ))}
              {form.skills.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove skill ${n}`}
                  onClick={() => set({ skills: form.skills.filter((_, j) => j !== i) })}
                  className="min-h-11 min-w-11 text-text-muted underline"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => set({ skills: [...form.skills, { name: "", core: false }] })}
          className="min-h-11 self-start text-accent underline"
        >
          Add skill
        </button>
        <Errors id={`${id}-skills-error`} errors={errorsFor("skills")} />
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-years`} className="font-medium">
          Years of experience
        </label>
        <input
          id={`${id}-years`}
          type="text"
          inputMode="numeric"
          value={form.years}
          onChange={(e) => set({ years: e.target.value })}
          className={`${input} md:w-32`}
          {...describe("years")}
        />
        <Errors id={`${id}-years-error`} errors={errorsFor("years")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-seniority`} className="font-medium">
          Seniority
        </label>
        <select
          id={`${id}-seniority`}
          value={form.seniority}
          onChange={(e) => set({ seniority: e.target.value })}
          className={`${input} md:w-48`}
          {...describe("seniority")}
        >
          <option value="">Choose…</option>
          {SENIORITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Errors id={`${id}-seniority-error`} errors={errorsFor("seniority")} />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium">Role types</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ROLE_TYPES.map((r) => (
            <label key={r} className={choice}>
              <input
                type="checkbox"
                checked={form.roleTypes.includes(r)}
                onChange={() => set({ roleTypes: toggle(form.roleTypes, r) })}
                className="size-5 accent-accent"
              />
              {ROLE_LABELS[r]}
            </label>
          ))}
        </div>
        <Errors id={`${id}-role_types-error`} errors={errorsFor("role_types")} />
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium">Minimum salary (gross)</legend>
        <div className="flex flex-wrap gap-2">
          <label htmlFor={`${id}-amount`} className="sr-only">
            Minimum salary amount
          </label>
          <input
            id={`${id}-amount`}
            type="text"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className={`${input} flex-1 md:w-40 md:flex-none`}
            {...describe("min_salary")}
          />
          <label htmlFor={`${id}-currency`} className="sr-only">
            Currency
          </label>
          <select
            id={`${id}-currency`}
            value={form.currency}
            onChange={(e) => set({ currency: e.target.value })}
            className={`${input} w-28`}
          >
            <option value="">Currency…</option>
            {[...new Set([...CURRENCIES, form.currency].filter(Boolean))].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-period`} className="sr-only">
            Period
          </label>
          <select
            id={`${id}-period`}
            value={form.period}
            onChange={(e) => set({ period: e.target.value })}
            className={`${input} w-32`}
          >
            <option value="">Period…</option>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                a {p}
              </option>
            ))}
          </select>
        </div>
        <Errors id={`${id}-min_salary-error`} errors={errorsFor("min_salary")} />
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium">Engagement forms</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ENGAGEMENT_FORMS.map((f) => (
            <label key={f} className={choice}>
              <input
                type="checkbox"
                checked={form.forms.includes(f)}
                onChange={() => set({ forms: toggle(form.forms, f) })}
                className="size-5 accent-accent"
              />
              {FORM_LABELS[f]}
            </label>
          ))}
        </div>
        <Errors id={`${id}-engagement_forms-error`} errors={errorsFor("engagement_forms")} />
      </fieldset>

      {banner}
      {footer ?? (
        <div className="flex flex-col gap-2">
          {initial && <p className="text-sm text-text-muted">Saving a change re-scores your postings.</p>}
          <Button type="submit" pending={saving}>
            Save
          </Button>
        </div>
      )}
    </form>
  );
}
