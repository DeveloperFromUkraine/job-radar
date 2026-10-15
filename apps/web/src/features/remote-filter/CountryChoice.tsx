import { useId, useState } from "react";
import { ApiError } from "../../api/collector";
import type { Country } from "../../api/remoteFilter";
import { Button } from "../../components/Button";
import { InlineBanner } from "../../components/InlineBanner";

interface CountryChoiceProps {
  /** The owner's own country ("Save") or a one-off look ("Look"). */
  purpose: "own" | "look";
  /** Suggestions only: the server decides what a typed name means. */
  countries: Country[];
  onSubmit: (name: string) => Promise<unknown>;
  onDone: () => void;
  onCancel: () => void;
}

const isKnown = (countries: Country[], value: string) => {
  const typed = value.trim().toLowerCase();
  return countries.some((c) => c.name.toLowerCase() === typed || c.flag === value.trim());
};

/** SCR-01 country choice, in place inside the location bar (screens.md NEW: CountryChoice). */
export function CountryChoice({ purpose, countries, onSubmit, onDone, onCancel }: CountryChoiceProps) {
  const id = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  /** REMOTE_FILTER_UNKNOWN_COUNTRY (AC-05); live once flagged. */
  const [invalid, setInvalid] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = () => {
    if (saving) return;
    setSaving(true);
    setFailure(null);
    onSubmit(name).then(
      () => {
        setSaving(false);
        onDone();
      },
      (err: Error) => {
        setSaving(false);
        if (err instanceof ApiError && err.code === "REMOTE_FILTER_UNKNOWN_COUNTRY") setInvalid(err.message);
        else setFailure(err.message);
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={`${id}-input`} className="font-medium">
        {purpose === "own" ? "Your country" : "Look at postings open to"}
      </label>
      <input
        id={`${id}-input`}
        type="text"
        list={`${id}-countries`}
        value={name}
        autoComplete="off"
        onChange={(e) => {
          setName(e.target.value);
          if (invalid && isKnown(countries, e.target.value)) setInvalid(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) onCancel();
        }}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className="min-h-11 w-full min-w-0 rounded-card border border-border bg-surface px-3 text-text"
      />
      <datalist id={`${id}-countries`}>
        {countries.map((c) => (
          <option key={c.code} value={c.name}>
            {`${c.flag} ${c.name}`}
          </option>
        ))}
      </datalist>
      {invalid && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {invalid}
        </p>
      )}
      {failure && <InlineBanner tone="error" title={failure} onRetry={submit} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={saving}>
          {purpose === "own" ? "Save" : "Look"}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
