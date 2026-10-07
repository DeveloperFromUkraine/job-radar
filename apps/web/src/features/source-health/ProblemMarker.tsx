import { Link } from "react-router";

/** Shown on the main screen while any flag can cost the owner postings (AC-13). */
export function ProblemMarker() {
  return (
    <Link
      to="/sources"
      className="flex min-h-11 flex-col gap-1 rounded-card border border-danger bg-surface-muted p-3 text-danger"
    >
      <span className="font-medium">A source has a problem that can cost you postings.</span>
      <span className="text-sm underline">Open source health</span>
    </Link>
  );
}
