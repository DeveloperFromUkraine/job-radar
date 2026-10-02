import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import type { SourceHealth } from "../../api/collector";
import { contractExample } from "../../test/contract";
import { mockApi, renderWithProviders } from "../../test/render";

const HEALTH = "GET /api/v1/collector/source-health";
const PROBLEMS = "GET /api/v1/collector/problems";
const RUNS = "POST /api/v1/collector/runs";
const noProblems = { body: contractExample("getCollectorProblems", 200, "none") };
const running = () => contractExample<SourceHealth>("getSourceHealth", 200, "collected"); // has a run in progress
const idle = (): SourceHealth => ({ ...running(), current_run: null });
const finished = (): SourceHealth => {
  const h = running();
  const run = h.current_run;
  if (!run) throw new Error("example has no run");
  return {
    ...h,
    current_run: null,
    last_run: {
      ...run,
      status: "finished",
      finished_at: "2026-10-02T09:01:00Z",
      sources: run.sources.map((s) => ({ ...s, outcome: "complete" as const })),
    },
  };
};

describe("collect now and run progress (SCR-02, Flow 2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const button = () => screen.findByRole("button", { name: "Collect now" });

  it("idle → started: the run in progress appears (AC-15)", async () => {
    const { calls } = mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: [{ body: idle() }, { body: running() }],
      [RUNS]: { status: 202, body: contractExample("collectNow", 202) },
    });
    renderWithProviders(<App />, { route: "/sources" });

    fireEvent.click(await button());

    expect(await screen.findByText(/Run in progress · started/)).toBeTruthy();
    expect(calls).toContainEqual({ method: "POST", path: "/api/v1/collector/runs" });
  });

  it("pending: the button is disabled with a spinner while the request is in flight", async () => {
    mockApi({ [PROBLEMS]: noProblems, [HEALTH]: { body: idle() } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST"
          ? new Promise<Response>(() => {})
          : new Response(JSON.stringify(String(input).includes("problems") ? noProblems.body : idle())),
      ),
    );
    renderWithProviders(<App />, { route: "/sources" });

    const b = await button();
    fireEvent.click(b);

    await waitFor(() => expect(b.getAttribute("aria-busy")).toBe("true"));
    expect(b.hasAttribute("disabled")).toBe(true);
  });

  it("nothing due: no run, and when each source is next due (AC-15)", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: { body: idle() },
      [RUNS]: { status: 200, body: contractExample("collectNow", 200) },
    });
    renderWithProviders(<App />, { route: "/sources" });

    fireEvent.click(await button());

    expect(await screen.findByText("Nothing can be read yet.")).toBeTruthy();
    expect(screen.getByText(/Jobicy .*· Himalayas .*· Remotive /)).toBeTruthy();
  });

  it("already running: told in place, the button stays usable (AC-16)", async () => {
    mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: { body: running() },
      [RUNS]: {
        status: 409,
        body: {
          error: { code: "COLLECTOR_RUN_IN_PROGRESS", message: "A collection run is already in progress." },
        },
      },
    });
    renderWithProviders(<App />, { route: "/sources" });

    const b = await button();
    expect(b.hasAttribute("disabled")).toBe(false);
    fireEvent.click(b);

    expect(await screen.findByText("A run is already in progress.")).toBeTruthy();
  });

  it("error: the API message with Retry", async () => {
    const { calls } = mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: { body: idle() },
      [RUNS]: [
        {
          status: 403,
          body: { error: { code: "CROSS_SITE_REQUEST", message: "Cross-site requests are not accepted." } },
        },
        { status: 202, body: contractExample("collectNow", 202) },
      ],
    });
    renderWithProviders(<App />, { route: "/sources" });
    fireEvent.click(await button());

    expect(await screen.findByText("Couldn't start a collection.")).toBeTruthy();
    expect(screen.getByText("Cross-site requests are not accepted.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(2));
  });

  it("shows each source's progress: collected, reading, not due yet, disabled", async () => {
    mockApi({ [PROBLEMS]: noProblems, [HEALTH]: { body: running() } });
    renderWithProviders(<App />, { route: "/sources" });

    const progress = await screen.findByRole("list", { name: "Run progress" });
    expect(progress.textContent).toContain("Jobicy");
    expect(progress.textContent).toContain("collected +4 · 1 updated");
    expect(progress.textContent).toContain("reading…");
    expect(progress.textContent).toContain("We Work Remotely");
    expect(progress.textContent).toContain("disabled");
  });

  it("polls every 2 s while a run is in progress and stops when it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = mockApi({
      [PROBLEMS]: noProblems,
      [HEALTH]: [{ body: running() }, { body: running() }, { body: finished() }],
    });
    renderWithProviders(<App />, { route: "/sources" });
    await screen.findByText(/Run in progress/);
    const healthCalls = () => calls.filter((c) => c.path === "/api/v1/collector/source-health").length;

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await screen.findByText(/Last run finished/)).toBeTruthy();
    const settled = healthCalls();
    expect(settled).toBeGreaterThanOrEqual(3);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(healthCalls()).toBe(settled);
  });
});
