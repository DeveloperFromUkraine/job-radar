import { NavLink } from "react-router";

const link = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center px-2 text-sm ${isActive ? "font-semibold text-text" : "text-text-muted"}`;

/** Top navigation between the main screen and source health. */
export function AppNav() {
  return (
    <nav className="flex items-center justify-between border-b border-border px-4" aria-label="Main">
      <span className="font-semibold">job-radar</span>
      <div className="flex gap-1">
        <NavLink to="/" end className={link}>
          Home
        </NavLink>
        <NavLink to="/sources" className={link}>
          Source health
        </NavLink>
      </div>
    </nav>
  );
}
