import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** A request is in flight: disabled, with an inline spinner. */
  pending?: boolean;
}

export function Button({ pending = false, disabled, children, className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-card)] bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60 md:w-auto ${className}`}
    >
      {pending && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-accent-contrast border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
