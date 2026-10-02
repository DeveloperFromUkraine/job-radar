import type { ReactNode } from "react";

const TONES = {
  error: "border-danger text-danger",
  warning: "border-danger text-text",
  info: "border-border text-text",
} as const;

interface InlineBannerProps {
  tone: keyof typeof TONES;
  title: string;
  /** API text goes here as a plain string — React renders it as text, never as markup. */
  children?: ReactNode;
  onRetry?: () => void;
}

/** Inline, next to what it is about — errors as alerts with Retry, notices as status (design-system). */
export function InlineBanner({ tone, title, children, onRetry }: InlineBannerProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex flex-col gap-2 rounded-[var(--radius-card)] border bg-surface-muted p-3 text-sm md:flex-row md:items-center ${TONES[tone]}`}
    >
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        {children !== undefined && <p className="text-text-muted">{children}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded border border-border px-3 text-text"
        >
          Retry
        </button>
      )}
    </div>
  );
}
