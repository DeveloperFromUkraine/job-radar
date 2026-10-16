import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderWithProviders } from "../../test/render";
import { RealnessSwitch } from "./RealnessSwitch";

const control = () => screen.getByRole("switch", { name: "Lower stale postings" }) as HTMLInputElement;

describe("RealnessSwitch (SCR-01 NEW)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("describes what it does and is disabled while the list reloads", () => {
    mockApi({});
    renderWithProviders(<RealnessSwitch on disabled onSaved={() => {}} />);
    expect(control().checked).toBe(true);
    expect(control().disabled).toBe(true);
    expect(control().getAttribute("aria-description")).toBe(
      "Moves postings with realness signals lower in best match first",
    );
  });

  it("shows the asked-for state and is disabled while saving", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    ); // the save never answers
    renderWithProviders(<RealnessSwitch on={true} disabled={false} onSaved={() => {}} />);
    fireEvent.click(control());
    await vi.waitFor(() => expect(control().disabled).toBe(true));
    expect(control().checked).toBe(false);
  });

  it("tells the list once saved", async () => {
    mockApi({ "POST /api/v1/realness/settings": { body: { realness_on: false } } });
    const onSaved = vi.fn();
    renderWithProviders(<RealnessSwitch on={true} disabled={false} onSaved={onSaved} />);
    fireEvent.click(control());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
