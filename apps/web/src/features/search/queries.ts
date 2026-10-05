import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getNextPage,
  getWaitingCount,
  openVisit,
  type PostingPage,
  runSearch,
  type SearchResult,
} from "../../api/search";

/** Flow 1: records the visit once per screen opening and returns the remembered skills (AC-13). */
export function useVisit() {
  return useQuery({
    queryKey: ["search", "visit"],
    queryFn: openVisit,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    gcTime: 0, // the next opening records a new visit
  });
}

/** What the list shows: the skills text as submitted, and a counter that forces a fresh snapshot. */
export interface SearchRequest {
  skills: string;
  run: number;
}

type Page = SearchResult | PostingPage;
type Cursor = { snapshotId: string; cursor: string } | null;

/**
 * Flow 3 then flows 2/5: the first page is a new snapshot, later pages come from it. Pages are
 * appended and never refetched while shown, so a posting closed while on screen stays (AC-16).
 */
export function useSearchList(req: SearchRequest | null) {
  return useInfiniteQuery<Page, Error, { pages: Page[] }, (string | number)[], Cursor>({
    queryKey: ["search", "list", req?.skills ?? "", req?.run ?? 0],
    enabled: req !== null,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      pageParam ? getNextPage(pageParam.snapshotId, pageParam.cursor) : runSearch(req?.skills ?? ""),
    getNextPageParam: (last, pages) => {
      const first = pages[0] as SearchResult;
      return last.next_cursor ? { snapshotId: first.snapshot_id, cursor: last.next_cursor } : undefined;
    },
    placeholderData: keepPreviousData, // the list on screen stays while a new search runs
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/** Flow 2: every 60 s and on window focus, only while the tab is visible. Errors stay silent. */
export function useWaitingCount(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ["search", "waiting", snapshotId],
    queryFn: () => getWaitingCount(snapshotId as string),
    enabled: snapshotId !== undefined,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
