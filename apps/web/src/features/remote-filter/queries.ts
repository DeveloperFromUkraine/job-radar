import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRemoteFilterSettings, setFilterOn, setLook } from "../../api/remoteFilter";

export const SETTINGS_KEY = ["remote-filter", "settings"];

/** The owner's country, on/off state and the country list (one query; sad §8 UI data access). */
export function useRemoteFilterSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: getRemoteFilterSettings, retry: false });
}

export type Switch = "off" | "on" | "back";

/** Switch the filter off or on, or end a look; on success the settings reload and `onChange` re-runs the search. */
export function useFilterSwitch(onChange: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: Switch): Promise<unknown> =>
      action === "back" ? setLook(null) : setFilterOn(action === "on"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      onChange();
    },
  });
}
