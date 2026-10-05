import type { ReactNode } from "react";

const TONES = {
  enabled: "border-border text-text-muted",
  problem: "border-danger text-danger",
  notice: "border-border text-text",
  disabled: "border-border text-text-muted opacity-70",
  not_verified: "border-border text-text-muted opacity-70",
  new: "border-accent bg-accent text-accent-contrast",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${TONES[tone]}`}>{children}</span>
  );
}
