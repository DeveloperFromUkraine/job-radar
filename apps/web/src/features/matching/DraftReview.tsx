// screens.md SCR-03 NEW: DraftReview — the draft beside the current profile, each field tagged from
// your CV / not found, not-mapped values listed, and the removed contact details named (AC-07, AC-09).
// The draft is corrected in ProfileForm's fields before it is used.
import type { ReactNode } from "react";
import type { CvDraft, Profile } from "../../api/matching";
import { Badge } from "../../components/Badge";
import { InlineBanner } from "../../components/InlineBanner";
import { ProfileForm } from "./ProfileForm";

const FIELD_LABELS: Record<keyof Profile, string> = {
  skills: "Skills",
  years: "Years of experience",
  seniority: "Seniority",
  role_types: "Role types",
  min_salary: "Minimum salary",
  engagement_forms: "Engagement forms",
};

function removedSummary(removed: CvDraft["removed"]): string | null {
  if (removed.length === 0) return null;
  const has = (k: string) => removed.some((r) => r.kind === k);
  const links = removed.filter((r) => r.kind === "link").length;
  const parts = [
    has("name") && "your name",
    has("email") && "email",
    has("phone") && "phone",
    has("address") && "address",
    links > 0 && (links === 1 ? "1 link" : `${links} links`),
  ].filter(Boolean);
  return `Removed before anything was sent: ${parts.join(", ")}.`;
}

function summary(p: Profile): string {
  return [
    p.skills.map((s) => `${s.name}${s.core ? " (core)" : ""}`).join(", "),
    p.years !== null && `${p.years} years`,
    p.seniority,
    p.role_types.join(", "),
    p.min_salary && `${p.min_salary.amount} ${p.min_salary.currency} a ${p.min_salary.period}`,
    p.engagement_forms.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function DraftReview({
  draft,
  onUse,
  onDiscard,
  saving,
  banner,
  footer,
}: {
  draft: CvDraft;
  onUse: (profile: Profile) => void;
  onDiscard: () => void;
  saving?: boolean;
  banner?: ReactNode;
  footer?: ReactNode;
}) {
  const removed = removedSummary(draft.removed);
  const tags = Object.fromEntries(
    (Object.keys(FIELD_LABELS) as (keyof Profile)[]).map((f) => [
      f,
      <Badge key={f} tone="notice">
        {draft.field_sources[f] === "from_cv" ? "from your CV" : "not found in your CV"}
      </Badge>,
    ]),
  );
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">Draft from your CV</h2>
      {removed && <InlineBanner tone="info" title={removed} />}
      <ul className="flex flex-col gap-1 text-sm">
        {draft.not_mapped.map((n) => (
          <li key={`${n.field}-${n.value}`}>
            {FIELD_LABELS[n.field]} — not mapped: {n.value}
          </li>
        ))}
      </ul>
      {/* Two columns only beside a current profile (review R29). */}
      <div className={`grid gap-4 ${draft.current ? "md:grid-cols-[1fr_16rem] md:items-start" : ""}`}>
        <ProfileForm
          initial={draft.draft}
          tags={tags}
          onSave={onUse}
          saving={saving}
          banner={
            <>
              {/* On phones, below the fields and above the buttons (wireframe 03-d, review R30). */}
              {draft.current && (
                <details className="rounded-card border border-border p-3 text-sm md:hidden">
                  <summary className="min-h-11 cursor-pointer content-center">Show current profile</summary>
                  <p>{summary(draft.current)}</p>
                </details>
              )}
              {banner}
            </>
          }
          footer={footer}
          submitLabel="Use this profile"
          secondary={
            <button
              type="button"
              onClick={onDiscard}
              className="min-h-11 rounded-card border border-border px-4 text-text"
            >
              Discard
            </button>
          }
        />
        {draft.current && (
          <aside
            aria-label="Current profile"
            className="hidden rounded-card border border-border p-3 text-sm md:block"
          >
            <h3 className="font-medium">Current profile</h3>
            <p>{summary(draft.current)}</p>
          </aside>
        )}
      </div>
    </div>
  );
}
