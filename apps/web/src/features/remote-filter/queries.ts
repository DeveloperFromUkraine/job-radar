import { useQuery } from "@tanstack/react-query";
import { getRemoteFilterSettings } from "../../api/remoteFilter";

export const SETTINGS_KEY = ["remote-filter", "settings"];

/** The owner's country, on/off state and the country list (one query; sad §8 UI data access). */
export function useRemoteFilterSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: getRemoteFilterSettings, retry: false });
}
