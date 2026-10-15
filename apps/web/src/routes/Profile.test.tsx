import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { MatchingSettings, SaveProfileResult } from "../api/matching";
import { contractExample } from "../test/contract";
import { mockApi, renderWithProviders } from "../test/render";

const SETTINGS = "GET /api/v1/matching/settings";
const SAVE = "POST /api/v1/matching/profile";
const NOTICE = "POST /api/v1/matching/notice";
const CAP = "POST /api/v1/matching/cap";
const firstOpen = () => contractExample<MatchingSettings>("getMatchingSettings", 200, "first_open");
const withProfile = () => contractExample<MatchingSettings>("getMatchingSettings", 200, "with_profile");
const changed = () => contractExample<SaveProfileResult>("saveProfile", 200, "changed");
const unchanged = () => contractExample<SaveProfileResult>("saveProfile", 200, "unchanged");
const agreed = { body: { notice_agreed_at: "2026-10-15T09:00:00Z" } };
const err = (status: number, code: string, message: string) => ({
  status,
  body: { error: { code, message } },
});

const bodies = (fetchMock: ReturnType<typeof mockApi>["fetchMock"], path: string) =>
  fetchMock.mock.calls
    .filter(([p, init]) => String(p) === path && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));

const open = (overrides: Parameters<typeof mockApi>[0]) => {
  const api = mockApi(overrides);
  renderWithProviders(<App />, { route: "/profile" });
  return api;
};

async function fillByHand() {
  fireEvent.change(await screen.findByLabelText("Skill 1"), { target: { value: "TypeScript" } });
  fireEvent.click(screen.getByRole("radio", { name: "Skill 1 core" }));
  fireEvent.change(screen.getByLabelText("Years of experience"), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText("Seniority"), { target: { value: "senior" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "fullstack" }));
  fireEvent.change(screen.getByLabelText("Minimum salary amount"), { target: { value: "6000" } });
  fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "EUR" } });
  fireEvent.change(screen.getByLabelText("Period"), { target: { value: "month" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "B2B" }));
}

describe("SCR-03 profile screen", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is reachable from the navigation", async () => {
    open({ [SETTINGS]: { body: withProfile() } });
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe("/profile");
    expect(await screen.findByRole("heading", { name: "Your profile" })).toBeTruthy();
  });

  it("loading: card-shaped placeholders", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(<App />, { route: "/profile" });
    expect(screen.getAllByTestId("skeleton-row").length).toBeGreaterThanOrEqual(3);
  });

  it("load error: the API message with Retry, nothing editable", async () => {
    open({ [SETTINGS]: err(500, "INTERNAL", "Internal server error") });
    expect((await screen.findByRole("alert")).textContent).toContain("Internal server error");
    expect(screen.queryByLabelText("Skill 1")).toBeNull();
  });

  it("empty: by hand, the notice first, then saved and back to the list (AC-20, AC-21)", async () => {
    const { fetchMock } = open({
      [SETTINGS]: { body: firstOpen() },
      [NOTICE]: agreed,
      [SAVE]: { body: changed() },
      "POST /api/v1/search/visits": { body: contractExample("openVisit", 200, "returning") },
      "POST /api/v1/search/snapshots": { body: contractExample("runSearch", 200, "best_match") },
      "GET /api/v1/collector/problems": { body: contractExample("getCollectorProblems", 200, "none") },
    });
    expect(await screen.findByRole("heading", { name: "Set up your profile" })).toBeTruthy();
    await fillByHand();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The notice replaces the action area; nothing was sent yet.
    expect(await screen.findByText(/sends to Anthropic's Claude API/)).toBeTruthy();
    expect(bodies(fetchMock, "/api/v1/matching/profile")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Agree and continue" }));
    await waitFor(() => expect(bodies(fetchMock, "/api/v1/matching/profile")).toHaveLength(1));
    expect(bodies(fetchMock, "/api/v1/matching/profile")[0]).toEqual({
      profile: {
        skills: [{ name: "TypeScript", core: true }],
        years: 8,
        seniority: "senior",
        role_types: ["fullstack"],
        min_salary: { amount: 6000, currency: "EUR", period: "month" },
        engagement_forms: ["b2b"],
      },
    });
    expect(await screen.findByLabelText("Your skills")).toBeTruthy(); // back on the main screen
  });

  it("declining the notice sends nothing and keeps the form (AC-20)", async () => {
    const { fetchMock } = open({ [SETTINGS]: { body: firstOpen() } });
    await fillByHand();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.getByLabelText("Skill 1")).toMatchObject({ value: "TypeScript" });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("validation: the field error under the field, nothing sent, live once flagged (AC-16)", async () => {
    const { fetchMock } = open({ [SETTINGS]: { body: withProfile() } });
    fireEvent.click(await screen.findByRole("radio", { name: "Skill 1 nice-to-have" }));
    fireEvent.click(screen.getByRole("radio", { name: "Skill 2 nice-to-have" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const error = await screen.findByText("Skills: mark at least one skill as core.");
    expect(error.className).toContain("text-danger");
    expect(bodies(fetchMock, "/api/v1/matching/profile")).toHaveLength(0);
    fireEvent.click(screen.getByRole("radio", { name: "Skill 1 core" }));
    await waitFor(() => expect(screen.queryByText("Skills: mark at least one skill as core.")).toBeNull());
  });

  it("server validation as the backstop: the message above Save, profile unchanged", async () => {
    open({
      [SETTINGS]: { body: withProfile() },
      [SAVE]: err(
        400,
        "MATCHING_INVALID_PROFILE",
        "Skills: remove the email address; a profile holds no contact details.",
      ),
    });
    await screen.findByLabelText("Skill 1");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Skills: remove the email address; a profile holds no contact details."),
    ).toBeTruthy();
  });

  it("saved with nothing changed: says so and stays (AC-10 note)", async () => {
    open({ [SETTINGS]: { body: withProfile() }, [SAVE]: { body: unchanged() } });
    await screen.findByLabelText("Skill 1");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nothing changed — your scores stay as they are.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your profile" })).toBeTruthy();
  });

  it("filled: the current profile, with the re-score line (AC-10)", async () => {
    open({ [SETTINGS]: { body: withProfile() } });
    expect(await screen.findByLabelText("Skill 1")).toMatchObject({ value: "TypeScript" });
    expect(screen.getByLabelText("Seniority")).toMatchObject({ value: "senior" });
    expect(screen.getByText("Saving a change re-scores your postings.")).toBeTruthy();
  });

  it("save error: the API message with Retry; the typed values are kept", async () => {
    open({ [SETTINGS]: { body: withProfile() }, [SAVE]: err(500, "INTERNAL", "Internal server error") });
    await screen.findByLabelText("Skill 1");
    fireEvent.change(screen.getByLabelText("Years of experience"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Internal server error");
    expect(screen.getByLabelText("Years of experience")).toMatchObject({ value: "9" });
  });
});

describe("SCR-03 scoring cap (AC-19)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const capField = async () => {
    const section = (await screen.findByRole("heading", { name: "Monthly scoring cap" })).closest("section");
    return within(section as HTMLElement);
  };

  it("shows the cap, this month's spend and the provider-limit hint", async () => {
    open({ [SETTINGS]: { body: withProfile() } });
    const cap = await capField();
    expect(cap.getByLabelText("Cap in dollars")).toMatchObject({ value: "5.00" });
    expect(cap.getByText("Spent this month: $4.98")).toBeTruthy();
    expect(
      cap.getByText("$0 pauses scoring. Also set a spending limit in your provider account."),
    ).toBeTruthy();
  });

  it.each([
    ["8", 800, { cap_usd_cents: 800, spent_usd_cents: 498 }, "Saved — scoring resumes."],
    ["4", 400, { cap_usd_cents: 400, spent_usd_cents: 498 }, /^Saved — scoring stays stopped until 1 /],
    ["0", 0, { cap_usd_cents: 0, spent_usd_cents: 498 }, "Saved — scoring paused."],
  ])("saving %s sends %d cents and says what happens", async (typed, cents, after, message) => {
    const { fetchMock } = open({
      [SETTINGS]: { body: withProfile() },
      [CAP]: { body: { ...withProfile(), ...after } },
    });
    const cap = await capField();
    fireEvent.change(cap.getByLabelText("Cap in dollars"), { target: { value: typed } });
    fireEvent.click(cap.getByRole("button", { name: "Save cap" }));
    await waitFor(() =>
      expect(bodies(fetchMock, "/api/v1/matching/cap")).toEqual([{ cap_usd_cents: cents }]),
    );
    expect(await cap.findByText(message)).toBeTruthy();
    // The message stays once the saved settings reach the cache (review R27): look again at the field on screen.
    await act(() => new Promise((r) => setTimeout(r, 20)));
    const now = await capField();
    expect(now.getByText(message)).toBeTruthy();
    expect(now.getByLabelText("Cap in dollars")).toMatchObject({ value: (cents / 100).toFixed(2) });
  });

  it("shows the saved cap after leaving the screen and coming back (AC-19, review R16)", async () => {
    const after = { ...withProfile(), cap_usd_cents: 800 };
    open({
      [SETTINGS]: [{ body: withProfile() }, { body: after }],
      [CAP]: { body: after },
    });
    const cap = await capField();
    fireEvent.change(cap.getByLabelText("Cap in dollars"), { target: { value: "8" } });
    fireEvent.click(cap.getByRole("button", { name: "Save cap" }));
    expect(await cap.findByText("Saved — scoring resumes.")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    const back = await capField();
    expect(back.getByLabelText("Cap in dollars")).toMatchObject({ value: "8.00" });
    await waitFor(() => expect(back.getByLabelText("Cap in dollars")).toMatchObject({ value: "8.00" }));
  });

  it("refuses a cap outside $0–$100 without sending", async () => {
    const { fetchMock } = open({ [SETTINGS]: { body: withProfile() } });
    const cap = await capField();
    fireEvent.change(cap.getByLabelText("Cap in dollars"), { target: { value: "100.01" } });
    fireEvent.click(cap.getByRole("button", { name: "Save cap" }));
    expect((await cap.findByText("Use an amount from $0 to $100.")).className).toContain("text-danger");
    expect(bodies(fetchMock, "/api/v1/matching/cap")).toHaveLength(0);
  });
});
