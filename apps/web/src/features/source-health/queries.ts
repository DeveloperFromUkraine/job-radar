import { useQuery } from "@tanstack/react-query";
import { getProblems, getSourceHealth } from "../../api/collector";

/** SCR-01 marker: on window focus and every 60 s, the due-check cadence (screens.md SCR-01). */
export function useProblems() {
  return useQuery({
    queryKey: ["collector", "problems"],
    queryFn: getProblems,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** SCR-02: refetched on window focus; polled while a run is in progress (ADR-0002, T23). */
export function useSourceHealth() {
  return useQuery({
    queryKey: ["collector", "source-health"],
    queryFn: getSourceHealth,
    refetchOnWindowFocus: true,
  });
}
