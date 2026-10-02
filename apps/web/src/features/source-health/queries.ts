import { useQuery } from "@tanstack/react-query";
import { getProblems } from "../../api/collector";

/** SCR-01 marker: on window focus and every 60 s, the due-check cadence (screens.md SCR-01). */
export function useProblems() {
  return useQuery({
    queryKey: ["collector", "problems"],
    queryFn: getProblems,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
