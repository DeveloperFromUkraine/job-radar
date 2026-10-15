import { useQuery } from "@tanstack/react-query";
import { getScoringHealth } from "../../api/matching";

/** SCR-01 and SCR-02: scoring health, on window focus and every 60 s like the collector's problems. */
export function useScoringHealth() {
  return useQuery({
    queryKey: ["matching", "health"],
    queryFn: getScoringHealth,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
