import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { MarkState, Posting, SearchResult, Visit } from "../api/search";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

// applied-skipped SCR-01 main list: marking, the Undo notice, undo refused (AC-01 – AC-04, AC-12).
const PROBLEMS = "GET /api/v1/collector/problems";
const VISIT = "POST /api/v1/search/visits";
const SEARCH = "POST /api/v1/search/snapshots";
const A = "01926a00-0000-7000-8000-0000000000b1"; // new
const B = "01926a00-0000-7000-8000-0000000000b2";
const C = "01926a00-0000-7000-8000-0000000000b3";
const MARK = (id: string) => `POST /api/v1/tracking/marks/${id}`;
const UNDO = (id: string) => `POST /api/v1/tracking/marks/${id}/undo`;

const base = { body: contractExample("getCollectorProblems", 200, "none") };
const returning = { body: contractExample<Visit>("openVisit", 200, "returning") };
const found = (): SearchResult => {
  const r = contractExample<SearchResult>("runSearch", 200, "found");
  const first = r.items[0] as Posting;
  return {
    ...r,
    marked_count: 0,
    items: [
      { ...first, id: A, title: "Role A", is_new: true, look_alike: null },
      { ...first, id: B, title: "Role B", is_new: false, look_alike: null },
      { ...first, id: C, title: "Role C", is_new: false, look_alike: null },
    ],
  };
};
const state = (id: string, mark: "applied" | "skipped" | null, change: string): { body: MarkState } => ({
  body: { ...contractExample<MarkState>("setMark", 200, "applied"), posting_id: id, mark, change_id: change },
});
const refused = {
  status: 409,
  body: {
    error: {
      code: "TRACKING_MARK_CHANGED_ELSEWHERE",
      message:
        "This mark was changed elsewhere, so it was not undone. See the marked postings for its current mark.",
    },
  },
};

const unavailable = {
  status: 503,
  body: {
    error: {
      code: "TRACKING_MARKS_UNAVAILABLE",
      message: "Job-radar could not save your mark just now. Try again.",
    },
  },
};

const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const notice = () => screen.queryByTestId("undo-notice");

async function open(routes: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi({ [PROBLEMS]: base, [VISIT]: returning, [SEARCH]: { body: found() }, ...routes });
  renderWithProviders(<App />);
  await screen.findByText("130 postings · 3 new");
  return api;
}

describe("SCR-01 marking and Undo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("marked: the card leaves only after the save, counts drop, the notice offers Undo (AC-01, AC-14)", async () => {
    const { fetchMock } = await open({ [MARK(A)]: state(A, "applied", "c1") });

    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    expect(titles()).toContain("Role A"); // never optimistic

    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));
    expect(screen.getByText("129 postings · 2 new")).toBeTruthy();
    expect(within(notice() as HTMLElement).getByText("Marked applied")).toBeTruthy();
    expect(within(notice() as HTMLElement).getByRole("button", { name: "Undo" })).toBeTruthy();
    const call = fetchMock.mock.calls.find(([p]) => String(p).includes("/tracking/marks/"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ mark: "applied" });
  });

  it("skipped: the notice says so (AC-02)", async () => {
    await open({ [MARK(B)]: state(B, "skipped", "c1") });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role B skipped" }));
    await waitFor(() => expect(titles()).toEqual(["Role A", "Role C"]));
    expect(screen.getByText("129 postings · 3 new")).toBeTruthy();
    expect(within(notice() as HTMLElement).getByText("Marked skipped")).toBeTruthy();
  });

  it("undone: the card returns to its place with its New badge and the counts (AC-03)", async () => {
    const { fetchMock } = await open({
      [MARK(A)]: state(A, "applied", "c1"),
      [UNDO(A)]: state(A, null, "c2"),
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));

    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(titles()).toEqual(["Role A", "Role B", "Role C"]));
    expect(screen.getByText("130 postings · 3 new")).toBeTruthy();
    expect(screen.getAllByText("New")).toHaveLength(1);
    expect(notice()).toBeNull();
    const undo = fetchMock.mock.calls.find(([p]) => String(p).endsWith("/undo"));
    expect(JSON.parse(String(undo?.[1]?.body))).toEqual({ change_id: "c1" });
  });

  it("undo refused: nothing reverts; the notice points to the marked postings (AC-04)", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1"), [UNDO(A)]: refused });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));

    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Undo" }));

    // The refused notice replaces the marked one (a new element: it restarts the 8 s).
    expect(
      await screen.findByText(
        "This mark was changed elsewhere, so it was not undone. See the marked postings for its current mark.",
      ),
    ).toBeTruthy();
    expect(
      within(notice() as HTMLElement).getByRole("button", { name: "Show marked postings" }),
    ).toBeTruthy();
    expect(titles()).toEqual(["Role B", "Role C"]);
  });

  it("the notice closes after 8 s, and Undo is gone with it (spec §6 Undo window)", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1") });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(notice()).not.toBeNull());
    // waitFor resolves on the DOM change, before React runs the notice's effect that starts the 8 s.
    await act(() => new Promise((r) => setTimeout(r, 0)));
    act(() => vi.advanceTimersByTime(7_900));
    expect(notice()).not.toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(notice()).toBeNull();
  });

  it("a second mark replaces the notice; Undo covers only the latest change (AC-03)", async () => {
    const { fetchMock } = await open({
      [MARK(A)]: state(A, "applied", "c1"),
      [MARK(B)]: state(B, "skipped", "c2"),
      [UNDO(B)]: state(B, null, "c3"),
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));
    fireEvent.click(screen.getByRole("button", { name: "Mark Role B skipped" }));
    await waitFor(() => expect(titles()).toEqual(["Role C"]));
    expect(screen.getAllByTestId("undo-notice")).toHaveLength(1);
    expect(within(notice() as HTMLElement).getByText("Marked skipped")).toBeTruthy();

    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));
    expect(fetchMock.mock.calls.filter(([p]) => String(p).endsWith("/undo"))).toHaveLength(1);
  });

  it("two cards marked back to back both leave, each on its own answer (AC-01)", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1"), [MARK(B)]: state(B, "skipped", "c2") });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Role B skipped" })); // before A's answer
    await waitFor(() => expect(titles()).toEqual(["Role C"]));
    expect(screen.getByText("128 postings · 2 new")).toBeTruthy();
  });

  it("a new search that fails keeps cards marked in this window out of the list on screen (AC-12)", async () => {
    await open({
      [SEARCH]: [{ body: found() }, unavailable],
      [MARK(A)]: state(A, "applied", "c1"),
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Couldn't load postings.")).toBeTruthy();
    expect(titles()).toEqual(["Role B", "Role C"]);
    expect(screen.getByText("129 postings · 2 new")).toBeTruthy();
  });

  it("focus follows the card: onto Undo after a mark, back onto the restored card after Undo", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1"), [UNDO(A)]: state(A, null, "c2") });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    const undo = await within(await screen.findByTestId("undo-notice")).findByRole("button", {
      name: "Undo",
    });
    await waitFor(() => expect(document.activeElement).toBe(undo));

    fireEvent.click(undo);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mark Role A applied" })),
    );
  });

  it("turning the switch on closes the notice (AC-03)", async () => {
    await open({
      [MARK(A)]: state(A, "applied", "c1"),
      "POST /api/v1/search/marked-snapshots": { body: contractExample("runMarkedView", 200) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(notice()).not.toBeNull());
    fireEvent.click(screen.getByRole("switch", { name: "Show marked postings" }));
    await waitFor(() => expect(notice()).toBeNull());
  });

  it("never refetches the list after a mark or an Undo: cards change from the answers alone (AC-12)", async () => {
    const { calls } = await open({ [MARK(A)]: state(A, "applied", "c1"), [UNDO(A)]: state(A, null, "c2") });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    fireEvent.click(
      await within(await screen.findByTestId("undo-notice")).findByRole("button", { name: "Undo" }),
    );
    await waitFor(() => expect(titles()).toEqual(["Role A", "Role B", "Role C"]));
    // runSearch once (the first list) and no getNextPage; the waiting poll is not a refetch.
    expect(calls.filter((c) => c.path === "/api/v1/search/snapshots")).toHaveLength(1);
    expect(calls.filter((c) => c.path.endsWith("/pages"))).toEqual([]);
  });

  it("a search closes the notice (AC-03)", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1") });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(notice()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(notice()).toBeNull());
  });
});

const gone = {
  status: 404,
  body: { error: { code: "TRACKING_POSTING_NOT_FOUND", message: "This posting is no longer in job-radar." } },
};

describe("SCR-01 mark failures and nothing left (AC-13, AC-14, AC-15)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("save error: the card keeps its state with the message and Retry, which repeats the call (AC-14)", async () => {
    const { fetchMock } = await open({ [MARK(A)]: [unavailable, state(A, "applied", "c1")] });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Couldn't save your mark.")).toBeTruthy();
    expect(within(alert).getByText("Job-radar could not save your mark just now. Try again.")).toBeTruthy();
    expect(titles()).toEqual(["Role A", "Role B", "Role C"]);
    expect(screen.getByText("130 postings · 3 new")).toBeTruthy();
    expect(notice()).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(titles()).toEqual(["Role B", "Role C"]));
    expect(screen.queryByRole("alert")).toBeNull();
    const marks = fetchMock.mock.calls.filter(([p]) => String(p) === `/api/v1/tracking/marks/${A}`);
    expect(marks.map(([, init]) => init?.body)).toEqual(['{"mark":"applied"}', '{"mark":"applied"}']);
  });

  it("a failed Undo keeps the notice with the message and Retry (AC-14)", async () => {
    await open({ [MARK(A)]: state(A, "applied", "c1"), [UNDO(A)]: [unavailable, state(A, null, "c2")] });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role A applied" }));
    await waitFor(() => expect(notice()).not.toBeNull());
    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Undo" }));

    expect(await screen.findByText(/could not save your mark/)).toBeTruthy(); // the notice remounts
    expect(titles()).toEqual(["Role B", "Role C"]);
    fireEvent.click(within(notice() as HTMLElement).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(titles()).toEqual(["Role A", "Role B", "Role C"]));
  });

  it("posting gone: the card leaves with no mark and no Undo, the count drops (AC-15)", async () => {
    await open({ [MARK(B)]: gone });
    fireEvent.click(screen.getByRole("button", { name: "Mark Role B skipped" }));
    await waitFor(() => expect(titles()).toEqual(["Role A", "Role C"]));
    expect(screen.getByText("129 postings · 3 new")).toBeTruthy();
    expect(within(notice() as HTMLElement).getByText("This posting is no longer in job-radar.")).toBeTruthy();
    expect(within(notice() as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("nothing left to review: the marked count and one action to show them (AC-13)", async () => {
    mockApi({
      [PROBLEMS]: base,
      [VISIT]: returning,
      [SEARCH]: { body: contractExample<SearchResult>("runSearch", 200, "nothing_left") },
    });
    renderWithProviders(<App />);
    expect(
      await screen.findByText("Nothing left to review. You've marked 3 matching postings."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show marked postings" })).toBeTruthy();
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });

  it("a card that left as gone is not counted as marked in nothing left to review (AC-13, AC-15)", async () => {
    const two = { ...found(), total: 2, new_count: 0, items: found().items.slice(1) as Posting[] };
    mockApi({
      [PROBLEMS]: base,
      [VISIT]: returning,
      [SEARCH]: { body: two },
      [MARK(B)]: state(B, "skipped", "c1"),
      [MARK(C)]: gone,
    });
    renderWithProviders(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark Role B skipped" }));
    await waitFor(() => expect(titles()).toEqual(["Role C"]));
    fireEvent.click(screen.getByRole("button", { name: "Mark Role C skipped" }));
    expect(await screen.findByText("Nothing left to review. You've marked 1 matching posting.")).toBeTruthy();
  });

  it("marking the last posting on screen leaves nothing to review", async () => {
    const one = { ...found(), total: 1, new_count: 0, items: [found().items[1] as Posting] };
    mockApi({
      [PROBLEMS]: base,
      [VISIT]: returning,
      [SEARCH]: { body: one },
      [MARK(B)]: state(B, "skipped", "c1"),
    });
    renderWithProviders(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark Role B skipped" }));
    expect(await screen.findByText("Nothing left to review. You've marked 1 matching posting.")).toBeTruthy();
  });
});
