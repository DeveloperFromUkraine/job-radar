/** A content-shaped placeholder while a list loads (design-system Loading). */
export function SkeletonRow() {
  return (
    <div
      data-testid="skeleton-row"
      aria-hidden="true"
      className="h-20 animate-pulse rounded-card bg-surface-muted"
    />
  );
}
