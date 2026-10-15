import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getRemoteFilterSettings, type LocationFilter, setFilterOn, setLook } from "../../api/remoteFilter";

export const SETTINGS_KEY = ["remote-filter", "settings"];

/** The owner's country, on/off state and the country list (one query; sad §8 UI data access). */
export function useRemoteFilterSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: getRemoteFilterSettings, retry: false });
}

export type Switch = "off" | "on" | "back";

/**
 * Switch the filter off or on, or end a look; on success the settings reload and `onChange` re-runs the search.
 * A new list (`filter`, the list's own filter) clears an old error, but never a request still running (re-review 2 N-2b).
 */
export function useFilterSwitch(onChange: () => void, filter: LocationFilter | undefined) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: Switch): Promise<unknown> =>
      action === "back" ? setLook(null) : setFilterOn(action === "on"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      onChange();
    },
  });
  const { isPending, reset } = mutation;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed to the list, not to the mutation's own state
  useEffect(() => {
    if (!isPending) reset();
  }, [filter]);
  return mutation;
}
