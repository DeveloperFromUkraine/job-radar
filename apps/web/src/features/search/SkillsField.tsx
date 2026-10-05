import { useId } from "react";
import { Button } from "../../components/Button";

interface SkillsFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** A search is in flight: the button is busy, the input stays editable. */
  pending?: boolean;
  /** The screen is loading: input and button disabled. */
  disabled?: boolean;
  /** The API's SEARCH_INVALID_SKILLS message (AC-05); re-checked on submit only. */
  error?: string;
}

/** SCR-01 skills field (screens.md NEW: SkillsField). Enter submits. */
export function SkillsField({ value, onChange, onSubmit, pending, disabled, error }: SkillsFieldProps) {
  const id = useId();
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={`${id}-input`} className="font-medium">
        Your skills
      </label>
      <div className="flex flex-col gap-2 md:flex-row">
        <input
          id={`${id}-input`}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="React, TypeScript, Go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
          className="min-h-11 w-full min-w-0 rounded-card border border-border bg-surface px-3 text-text disabled:opacity-60 md:flex-1"
        />
        <Button type="submit" pending={pending} disabled={disabled}>
          Search
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
      <p id={`${id}-hint`} className="text-sm text-text-muted">
        Separate skills with commas.
      </p>
    </form>
  );
}
