import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocationFilter, RemoteFilterSettings } from "../../api/remoteFilter";
import { contractExample } from "../../test/contract";
import { mockApi, renderWithProviders } from "../../test/render";
import { LocationFilterBar } from "./LocationFilterBar";

const SETTINGS = "GET /api/v1/remote-filter/settings";
const PL = { code: "PL", name: "Poland", flag: "🇵🇱" };
const DE = { code: "DE", name: "Germany", flag: "🇩🇪" };
const firstOpen = () => contractExample<RemoteFilterSettings>("getRemoteFilterSettings", 200, "first_open");
const withPoland = (): RemoteFilterSettings => ({ ...firstOpen(), country: PL, filter_on: true });
const own: LocationFilter = { mode: "own", country: PL };
const fail = { status: 500, body: { error: { code: "INTERNAL", message: "Something went wrong." } } };

function setup(filter: LocationFilter | undefined, routes: Parameters<typeof mockApi>[0]) {
  const api = mockApi(routes);
  const onChange = vi.fn();
  renderWithProviders(<LocationFilterBar filter={filter} onChange={onChange} />);
  return { ...api, onChange };
}
const button = (name: string) => screen.findByRole("button", { name });

describe("LocationFilterBar (SCR-01)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loading: a one-line placeholder while the settings load", () => {
    setup(own, { [SETTINGS]: { body: withPoland() } });
    expect(screen.getByTestId("skeleton-row")).toBeTruthy();
  });

  it("settings error: the API message with Retry", async () => {
    setup(own, { [SETTINGS]: [fail, { body: withPoland() }] });
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Open to 🇵🇱 Poland")).toBeTruthy();
  });

  it("no country: the prompt with Choose country and Look at another country (AC-04)", async () => {
    setup({ mode: "none", country: null }, { [SETTINGS]: { body: firstOpen() } });
    expect(
      await screen.findByText("Choose your country to hide roles you can't take from there"),
    ).toBeTruthy();
    expect(await button("Choose country")).toBeTruthy();
    expect(await button("Look at another country")).toBeTruthy();
  });

  it("own: Open to Poland with Change, Other country and Switch off (AC-07)", async () => {
    setup(own, { [SETTINGS]: { body: withPoland() } });
    expect(await screen.findByText("Open to 🇵🇱 Poland")).toBeTruthy();
    for (const name of ["Change", "Other country", "Switch off"]) expect(await button(name)).toBeTruthy();
  });

  it("off: Location filter is off with Switch on, which re-runs the search (AC-07)", async () => {
    const { calls, onChange } = setup(
      { mode: "off", country: PL },
      {
        [SETTINGS]: { body: { ...withPoland(), filter_on: false } },
        "POST /api/v1/remote-filter/filter": { body: withPoland() },
      },
    );
    expect(await screen.findByText("Location filter is off")).toBeTruthy();
    fireEvent.click(await button("Switch on"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(calls).toContainEqual({ method: "POST", path: "/api/v1/remote-filter/filter" });
  });

  it("look: Showing postings open to Germany, Back to Poland ends it (AC-06)", async () => {
    const { calls, onChange } = setup(
      { mode: "look", country: DE },
      {
        [SETTINGS]: { body: withPoland() },
        "POST /api/v1/remote-filter/look": { body: contractExample("setLook", 200, "ended") },
      },
    );
    expect(await screen.findByText("Showing postings open to 🇩🇪 Germany")).toBeTruthy();
    fireEvent.click(await button("Back to Poland"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(calls).toContainEqual({ method: "POST", path: "/api/v1/remote-filter/look" });
  });

  it("look with no own country: Back to all postings", async () => {
    setup({ mode: "look", country: DE }, { [SETTINGS]: { body: firstOpen() } });
    expect(await button("Back to all postings")).toBeTruthy();
  });

  it("switching: the pressed action is pending and the others disabled", async () => {
    setup(own, { [SETTINGS]: { body: withPoland() } });
    const off = await button("Switch off");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    fireEvent.click(off);
    await waitFor(() => expect(off.getAttribute("aria-busy")).toBe("true"));
    expect((screen.getByRole("button", { name: "Change" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Other country" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("switch error: the bar keeps its state and shows the message with Retry", async () => {
    const { onChange } = setup(own, {
      [SETTINGS]: { body: withPoland() },
      "POST /api/v1/remote-filter/filter": [fail, { body: { ...withPoland(), filter_on: false } }],
    });
    fireEvent.click(await button("Switch off"));
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong.");
    expect(screen.getByText("Open to 🇵🇱 Poland")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("Change opens the choice in place; saving a country re-runs the search (AC-13)", async () => {
    const { onChange } = setup(own, {
      [SETTINGS]: { body: withPoland() },
      "POST /api/v1/remote-filter/country": { body: contractExample("chooseCountry", 200) },
    });
    fireEvent.click(await button("Change"));
    const input = screen.getByLabelText("Your country");
    fireEvent.change(input, { target: { value: "Portugal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(screen.queryByLabelText("Your country")).toBeNull();
  });

  it("Other country opens the look choice; an unknown name keeps the list as it is (AC-05)", async () => {
    const { onChange } = setup(own, {
      [SETTINGS]: { body: withPoland() },
      "POST /api/v1/remote-filter/look": {
        status: 400,
        body: { error: { code: "REMOTE_FILTER_UNKNOWN_COUNTRY", message: "No country matches that name." } },
      },
    });
    fireEvent.click(await button("Other country"));
    fireEvent.change(screen.getByLabelText("Look at postings open to"), { target: { value: "Europe" } });
    fireEvent.click(screen.getByRole("button", { name: "Look" }));
    expect(await screen.findByText("No country matches that name.")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
