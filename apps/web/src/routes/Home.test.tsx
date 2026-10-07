import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

const PROBLEMS = "GET /api/v1/collector/problems";

describe("SCR-01 main screen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("default: the shell with navigation and no marker", async () => {
    mockApi({ [PROBLEMS]: { body: contractExample("getCollectorProblems", 200, "none") } });
    renderWithProviders(<App />);

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Source health" }).getAttribute("href")).toBe("/sources");
    expect(await screen.findByText(/Postings will show here once browsing arrives/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("link", { name: /source has a problem/i })).toBeNull());
  });

  it("problem: a marker that links to source health (AC-13)", async () => {
    mockApi({ [PROBLEMS]: { body: contractExample("getCollectorProblems", 200, "problem") } });
    renderWithProviders(<App />);

    const marker = await screen.findByRole("link", {
      name: /A source has a problem that can cost you postings/,
    });
    expect(marker.getAttribute("href")).toBe("/sources");
  });

  it("loading: shows the shell without a marker and never blocks", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(<App />);

    expect(screen.getByText(/Postings will show here once browsing arrives/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /source has a problem/i })).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("error: an inline banner with the API message and Retry", async () => {
    const { calls } = mockApi({
      [PROBLEMS]: [
        { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error" } } },
        { body: contractExample("getCollectorProblems", 200, "problem") },
      ],
    });
    renderWithProviders(<App />);

    expect(await screen.findByText("Couldn't check your sources.")).toBeTruthy();
    expect(screen.getByText("Internal server error")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /source has a problem/i })).toBeTruthy();
    expect(calls.filter((c) => c.path === "/api/v1/collector/problems")).toHaveLength(2);
  });

  it("re-checks every 60 s so the marker appears and clears on an open screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = mockApi({
      [PROBLEMS]: [
        { body: contractExample("getCollectorProblems", 200, "none") },
        { body: contractExample("getCollectorProblems", 200, "problem") },
      ],
    });
    renderWithProviders(<App />);
    await screen.findByText(/Postings will show here/);
    await waitFor(() => expect(calls).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(60_000);

    expect(await screen.findByRole("link", { name: /source has a problem/i })).toBeTruthy();
  });
});
