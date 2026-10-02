import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { SourceHealth } from "../api/collector";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

const HEALTH = "GET /api/v1/collector/source-health";
const PROBLEMS = "GET /api/v1/collector/problems";
const collected = () => contractExample<SourceHealth>("getSourceHealth", 200, "collected");
const nothingYet = () => contractExample<SourceHealth>("getSourceHealth", 200, "nothing_yet");
const noProblems = { body: contractExample("getCollectorProblems", 200, "none") };

const open = (health: SourceHealth | { status: number; body: unknown }[]) => {
  const api = mockApi({
    [PROBLEMS]: noProblems,
    [HEALTH]: Array.isArray(health) ? health : { body: { ...health, current_run: null } },
  });
  renderWithProviders(<App />, { route: "/sources" });
  return api;
};

describe("SCR-02 source health page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loading: four card-shaped skeleton rows", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(<App />, { route: "/sources" });

    expect(screen.getByRole("heading", { name: "Source health" })).toBeTruthy();
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(4);
  });

  it("error: an inline banner with the API message and Retry", async () => {
    open([
      { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error" } } },
      { status: 200, body: { ...collected(), current_run: null } },
    ]);

    expect(await screen.findByText("Couldn't load source health.")).toBeTruthy();
    expect(screen.getByText("Internal server error")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Remotive" })).toBeTruthy();
  });

  it("empty: nothing collected yet, each source's next due (AC-12 Given)", async () => {
    open(nothingYet());

    expect(
      await screen.findByText("Nothing collected yet. Each source is read when it is due."),
    ).toBeTruthy();
    expect(screen.getByText(/Not collected yet · due/)).toBeTruthy();
  });

  it("default: one card per source in registry order (AC-12)", async () => {
    open(collected());

    const links = await screen.findAllByRole("link", { name: /Remotive|We Work Remotely/ });
    expect(links.map((l) => l.textContent)).toEqual(["Remotive", "We Work Remotely"]);
  });

  it("settings: defaults in use is a notice (AC-27)", async () => {
    open(nothingYet()); // its example says defaults are in use
    expect(
      await screen.findByText(
        "Your settings file was missing, so it was created with the built-in defaults.",
      ),
    ).toBeTruthy();
  });

  it("settings: an unreadable file is named in plain words (AC-27)", async () => {
    const health = collected();
    health.settings = {
      notice: null,
      problem: "The settings file is not valid JSON.",
      problem_since: "2026-10-02T09:00:00Z",
    };
    open(health);

    expect(
      await screen.findByText(/Your settings file can't be read: The settings file is not valid JSON\./),
    ).toBeTruthy();
    expect(screen.getByText("Collection keeps running on your last valid settings.")).toBeTruthy();
  });

  it("run interrupted: says nothing was closed because of it (AC-20)", async () => {
    const health = collected();
    health.last_run = {
      id: "01920f3a-7b2c-7d4e-8f00-0000000000a0",
      trigger: "schedule",
      status: "incomplete",
      started_at: "2026-10-02T07:00:00Z",
      finished_at: null,
      sources: [],
    };
    open(health);

    expect(
      await screen.findByText("The last run was interrupted. Nothing was closed because of it."),
    ).toBeTruthy();
  });
});
