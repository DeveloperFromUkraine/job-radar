import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { Posting, PostingPage, SearchResult, Visit } from "../api/search";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

const PROBLEMS = "GET /api/v1/collector/problems";
const VISIT = "POST /api/v1/search/visits";
const SEARCH = "POST /api/v1/search/snapshots";
const noProblems = { body: contractExample("getCollectorProblems", 200, "none") };
const returning = { body: contractExample<Visit>("openVisit", 200, "returning") };
const firstVisit = { body: contractExample("openVisit", 200, "first") };
const found = () => contractExample<SearchResult>("runSearch", 200, "found");
const card = (p: Partial<Posting>) => ({ ...(found().items[0] as Posting), ...p });
const feed = (): SearchResult => ({
  ...found(),
  skills: [],
  total: 412,
  items: [card({ matched_skills: [] })],
});
const firstVisitFeed = (): SearchResult => ({
  ...feed(),
  new_count: 0,
  items: [card({ matched_skills: [], is_new: false })],
});
const unavailable = {
  status: 503,
  body: {
    error: {
      code: "SEARCH_COLLECTION_UNAVAILABLE",
      message: "Job-radar could not read its postings just now. Try again.",
    },
  },
};

/** The JSON bodies sent to runSearch, in order. */
const searchBodies = (fetchMock: ReturnType<typeof mockApi>["fetchMock"]) =>
  fetchMock.mock.calls
    .filter(([path]) => String(path) === "/api/v1/search/snapshots")
    .map(([, init]) => JSON.parse(String(init?.body)));

const field = () => screen.getByLabelText("Your skills") as HTMLInputElement;

async function submit(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

describe("SCR-01 main screen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loading: the field and button are disabled with three skeleton rows", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(<App />);

    expect(field().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Search" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /source has a problem/i })).toBeNull();
  });

  it("default: remembered skills, a fresh search, the count, new marks and cards (AC-01, AC-13, AC-14)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("130 postings · 3 new")).toBeTruthy();
    expect(field().value).toBe("React, Go");
    expect(searchBodies(fetchMock)).toEqual([{ skills: "React, Go" }]);
    expect(screen.getByText("Senior React Engineer")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByText("React · title")).toBeTruthy();
  });

  it("feed: an empty field lists every open posting with no skill chips (AC-10)", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: { body: { ...returning.body, last_skills: [] } },
      [SEARCH]: { body: feed() },
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("412 open postings · 3 new")).toBeTruthy();
    expect(screen.queryByText(/· title/)).toBeNull();
    expect(screen.queryByText("TypeScript")).toBeNull();
  });

  it("first visit: no new count and no New badges (AC-14)", async () => {
    mockApi({ [PROBLEMS]: noProblems, [VISIT]: firstVisit, [SEARCH]: { body: firstVisitFeed() } });
    renderWithProviders(<App />);

    expect(await screen.findByText("412 open postings")).toBeTruthy();
    expect(screen.queryByText(/new$/)).toBeNull();
    expect(screen.queryByText("New")).toBeNull();
  });

  it("searching keeps the list on screen; validation shows the message and leaves the list unchanged (AC-05)", async () => {
    const invalid = contractExample<{ error: { message: string } }>("runSearch", 400, "no_letter");
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: [{ body: found() }, { status: 400, body: invalid }],
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");

    await submit("React, --");

    expect(await screen.findByText(invalid.error.message)).toBeTruthy();
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(field().value).toBe("React, --");
    expect(screen.getByText("130 postings · 3 new")).toBeTruthy();
    expect(screen.getByText("Senior React Engineer")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(searchBodies(fetchMock)).toEqual([{ skills: "React, Go" }, { skills: "React, --" }]);
  });

  it("nothing matches: names the skills and offers Clear skills, which runs the feed (AC-11)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: [{ body: contractExample("runSearch", 200, "nothing_matches") }, { body: feed() }],
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("Nothing matches Haskell.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear skills" }));

    expect(await screen.findByText("412 open postings · 3 new")).toBeTruthy();
    expect(field().value).toBe("");
    expect(searchBodies(fetchMock).at(-1)).toEqual({ skills: "" });
  });

  it("collection empty: points to source health; Clear skills only when skills were used (AC-11)", async () => {
    const empty = contractExample<SearchResult>("runSearch", 200, "collection_empty");
    mockApi({ [PROBLEMS]: noProblems, [VISIT]: firstVisit, [SEARCH]: { body: empty } });
    renderWithProviders(<App />);

    expect(await screen.findByText("The first collection hasn't brought postings yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open source health" }).getAttribute("href")).toBe("/sources");
    expect(screen.queryByRole("button", { name: "Clear skills" })).toBeNull();
  });

  it("collection empty after a skills search also offers Clear skills", async () => {
    const empty = { ...contractExample<SearchResult>("runSearch", 200, "collection_empty"), skills: ["Go"] };
    mockApi({ [PROBLEMS]: noProblems, [VISIT]: returning, [SEARCH]: { body: empty } });
    renderWithProviders(<App />);

    expect(await screen.findByText("The first collection hasn't brought postings yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear skills" })).toBeTruthy();
  });

  it("error: the message with Retry, skills kept, the last list still visible; Retry repeats the search (AC-12)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: [{ body: found() }, unavailable, { body: { ...found(), total: 131 } }],
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");

    await submit("Rust");

    expect(await screen.findByText("Couldn't load postings.")).toBeTruthy();
    expect(screen.getByText("Job-radar could not read its postings just now. Try again.")).toBeTruthy();
    expect(field().value).toBe("Rust");
    expect(screen.getByText("Senior React Engineer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("131 postings · 3 new")).toBeTruthy();
    expect(screen.queryByText("Couldn't load postings.")).toBeNull();
    expect(searchBodies(fetchMock)).toEqual([
      { skills: "React, Go" },
      { skills: "Rust" },
      { skills: "Rust" },
    ]);
  });

  it("error: a failed visit shows Retry, which records the visit again", async () => {
    const { calls } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: [unavailable, returning],
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("Couldn't load postings.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("130 postings · 3 new")).toBeTruthy();
    expect(calls.filter((c) => c.path === "/api/v1/search/visits")).toHaveLength(2);
  });

  it("problem: a marker that links to source health (collector AC-13)", async () => {
    mockApi({
      [PROBLEMS]: { body: contractExample("getCollectorProblems", 200, "problem") },
      [VISIT]: returning,
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);

    const marker = await screen.findByRole("link", {
      name: /A source has a problem that can cost you postings/,
    });
    expect(marker.getAttribute("href")).toBe("/sources");
  });

  it("the problem check failing: an inline banner with the API message and Retry", async () => {
    const { calls } = mockApi({
      [PROBLEMS]: [
        { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error" } } },
        { body: contractExample("getCollectorProblems", 200, "problem") },
      ],
      [VISIT]: returning,
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("Couldn't check your sources.")).toBeTruthy();
    expect(screen.getByText("Internal server error")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /source has a problem/i })).toBeTruthy();
    expect(calls.filter((c) => c.path === "/api/v1/collector/problems")).toHaveLength(2);
  });

  it("re-checks problems every 60 s so the marker appears on an open screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = mockApi({
      [PROBLEMS]: [noProblems, { body: contractExample("getCollectorProblems", 200, "problem") }],
      [VISIT]: returning,
      [SEARCH]: { body: found() },
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/v1/collector/problems")).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(60_000);

    expect(await screen.findByRole("link", { name: /source has a problem/i })).toBeTruthy();
  });
});

describe("SCR-01 paging, waiting notice and expired list", () => {
  const SNAPSHOT = "01926a3b-1c2d-7e4f-8a00-0000000000a1";
  const PAGES = `POST /api/v1/search/snapshots/${SNAPSHOT}/pages`;
  const WAITING = `POST /api/v1/search/snapshots/${SNAPSHOT}/waiting`;
  const id = (n: number) => `01926a00-0000-7000-8000-${String(n).padStart(12, "0")}`;
  const items = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => card({ id: id(from + i), title: `Posting ${from + i}` }));
  const first = (): SearchResult => ({ ...found(), items: items(0, 50) });
  const page = (from: number, to: number, next: string | null): PostingPage => ({
    items: items(from, to),
    has_next: next !== null,
    next_cursor: next,
  });
  const none = { body: { waiting_count: 0 } };

  afterEach(() => vi.unstubAllGlobals());

  const cursors = (fetchMock: ReturnType<typeof mockApi>["fetchMock"]) =>
    fetchMock.mock.calls
      .filter(([path]) => String(path).endsWith("/pages"))
      .map(([, init]) => JSON.parse(String(init?.body)).cursor);
  const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

  it("shows the newest 50, then 100, then all 130 in one-long-list order; shown pages are never refetched (AC-15)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: { body: first() },
      [WAITING]: none,
      [PAGES]: [{ body: page(50, 100, "100") }, { body: page(100, 130, null) }],
    });
    renderWithProviders(<App />);
    expect(await screen.findByText("130 postings · 3 new")).toBeTruthy();
    expect(titles()).toHaveLength(50);

    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    await waitFor(() => expect(titles()).toHaveLength(100));
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    await waitFor(() => expect(titles()).toHaveLength(130));

    expect(titles()).toEqual(Array.from({ length: 130 }, (_, i) => `Posting ${i}`));
    expect(screen.queryByRole("button", { name: "Show 50 more" })).toBeNull();
    expect(cursors(fetchMock)).toEqual(["50", "100"]);
    expect(searchBodies(fetchMock)).toHaveLength(1);
  });

  it("show more pending: the button is busy while the page loads", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: { body: first() },
      [WAITING]: none,
    });
    const reply = fetchMock.getMockImplementation() as (
      i: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((input, init) =>
      String(input).endsWith("/pages") ? new Promise(() => {}) : reply(input, init),
    );
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");

    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Show 50 more" }).getAttribute("aria-busy")).toBe("true"),
    );
  });

  it("show more error: a banner under the list, postings kept, Retry sends the same cursor (AC-12)", async () => {
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: { body: first() },
      [WAITING]: none,
      [PAGES]: [unavailable, { body: page(50, 100, "100") }],
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");

    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));

    expect(await screen.findByText("Couldn't load more postings.")).toBeTruthy();
    expect(screen.queryByText("Couldn't load postings.")).toBeNull();
    expect(titles()).toHaveLength(50);
    expect(screen.queryByRole("button", { name: "Show 50 more" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(titles()).toHaveLength(100));
    expect(screen.queryByText("Couldn't load more postings.")).toBeNull();
    expect(cursors(fetchMock)).toEqual(["50", "50"]);
  });

  it("list expired: reloads from the newest with the same skills and says so (ADR-0003)", async () => {
    const expired = contractExample("getNextPage", 410);
    const { fetchMock } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: [{ body: first() }, { body: { ...first(), total: 131 } }],
      [WAITING]: none,
      [PAGES]: { status: 410, body: expired },
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");

    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));

    expect(await screen.findByText("This list had expired and was reloaded from the newest.")).toBeTruthy();
    expect(await screen.findByText("131 postings · 3 new")).toBeTruthy();
    expect(searchBodies(fetchMock)).toEqual([{ skills: "React, Go" }, { skills: "React, Go" }]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("waiting: names how many postings wait; Refresh runs the search again without a new visit (AC-16)", async () => {
    const refreshed = { ...first(), snapshot_id: "01926a3b-1c2d-7e4f-8a00-0000000000b9", total: 134 };
    const { fetchMock, calls } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: [{ body: first() }, { body: refreshed }],
      [WAITING]: { body: contractExample("getWaitingCount", 200) },
      [`POST /api/v1/search/snapshots/${refreshed.snapshot_id}/waiting`]: none,
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("4 new postings are waiting.")).toBeTruthy();
    expect(titles()).toHaveLength(50); // nothing inserted into the list
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("134 postings · 3 new")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/waiting/)).toBeNull());
    expect(searchBodies(fetchMock)).toEqual([{ skills: "React, Go" }, { skills: "React, Go" }]);
    expect(calls.filter((c) => c.path === "/api/v1/search/visits")).toHaveLength(1);
  });

  it("waiting: one posting reads in the singular; zero shows nothing", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: { body: first() },
      [WAITING]: { body: { waiting_count: 1 } },
    });
    renderWithProviders(<App />);
    expect(await screen.findByText("1 new posting is waiting.")).toBeTruthy();
  });

  it("a failed waiting poll shows nothing and leaves the list as it is", async () => {
    const { calls } = mockApi({
      [PROBLEMS]: noProblems,
      [VISIT]: returning,
      [SEARCH]: { body: first() },
      [WAITING]: unavailable,
    });
    renderWithProviders(<App />);
    await screen.findByText("130 postings · 3 new");
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/waiting"))).toBe(true));

    expect(screen.queryByText(/waiting/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(titles()).toHaveLength(50);
  });
});
