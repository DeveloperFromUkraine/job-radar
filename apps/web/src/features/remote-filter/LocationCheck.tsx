import type { LocationCheck as Reason } from "../../api/remoteFilter";
import { Badge } from "../../components/Badge";

const REASONS: Record<Reason, string> = {
  exception: "Mentions an exception",
  hours_only: "Only working hours fit",
  not_recognised: "Location not recognised",
  not_stated: "Location not stated",
};

/** SCR-01 "check location" mark (remote-filter AC-02): no action of its own; the source link is the way to read it. */
export function LocationCheck({ reason }: { reason: Reason }) {
  return (
    <div className="flex flex-col items-start gap-1 text-sm">
      <Badge tone="notice">Check location</Badge>
      <p>{REASONS[reason]}</p>
    </div>
  );
}
