import { Button } from "../../components/Button";
import { InlineBanner } from "../../components/InlineBanner";

/**
 * screens.md SCR-03 NEW: DataNotice — the one-time step before anything leaves the machine (match-score
 * AC-20). It blocks the action that triggered it; declining sends nothing.
 */
export function DataNotice({
  onAgree,
  onDecline,
  agreeing = false,
  error,
}: {
  onAgree: () => void;
  onDecline: () => void;
  agreeing?: boolean;
  error?: string;
}) {
  return (
    <section
      aria-label="Before anything leaves your laptop"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface-muted p-3 text-sm"
    >
      <h2 className="font-medium">Before anything leaves your laptop</h2>
      <p>
        To score postings, job-radar sends to Anthropic's Claude API: your CV's text once, to draft your
        profile (contact details removed first), then your profile and each posting's text with every scoring.
        Never your name or contact details.
      </p>
      <a
        href="https://www.anthropic.com/legal/commercial-terms"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center self-start text-accent underline"
      >
        Provider terms
      </a>
      {error && <InlineBanner tone="error" title={error} onRetry={onAgree} />}
      <div className="flex flex-col gap-2 md:flex-row">
        <Button pending={agreeing} onClick={onAgree}>
          Agree and continue
        </Button>
        <button
          type="button"
          onClick={onDecline}
          disabled={agreeing}
          className="min-h-11 rounded-card border border-border px-4 text-text"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
