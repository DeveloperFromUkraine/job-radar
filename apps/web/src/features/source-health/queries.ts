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

/** SCR-02: refetched on window focus; polled while a run is in progress (ADR-0002). */
export function useSourceHealth() {
  return useQuery({
    queryKey: ["collector", "source-health"],
    queryFn: getSourceHealth,
    refetchOnWindowFocus: true,
    // Every 2 s while a run is in progress, otherwise every 60 s (ADR-0002, sad §4).
    refetchInterval: (query) => (query.state.data?.current_run ? 2_000 : 60_000),
  });
}
