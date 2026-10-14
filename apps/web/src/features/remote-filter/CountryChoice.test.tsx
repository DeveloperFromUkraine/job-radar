import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/collector";
import type { Country } from "../../api/remoteFilter";
import { CountryChoice } from "./CountryChoice";

const COUNTRIES: Country[] = [
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
];
const unknown = new ApiError("REMOTE_FILTER_UNKNOWN_COUNTRY", "No country matches that name.", 400);

function setup(onSubmit: (name: string) => Promise<unknown>, purpose: "own" | "look" = "own") {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(
    <CountryChoice
      purpose={purpose}
      countries={COUNTRIES}
      onSubmit={onSubmit}
      onDone={onDone}
      onCancel={onCancel}
    />,
  );
  return { onDone, onCancel, input: screen.getByRole("combobox") as HTMLInputElement };
}

describe("CountryChoice (SCR-01)", () => {
  it("open: labelled input with suggestions from the country list, Save and Cancel", () => {
    const { input } = setup(vi.fn());
    expect(screen.getByLabelText("Your country")).toBe(input);
    const options = [...document.querySelectorAll(`#${input.getAttribute("list")} option`)].map((o) =>
      o.getAttribute("value"),
    );
    expect(options).toEqual(["Germany", "Poland"]);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("open for a look: its own label and a Look button (AC-06)", () => {
    setup(vi.fn(), "look");
    expect(screen.getByLabelText("Look at postings open to")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Look" })).toBeTruthy();
  });

  it("saving → saved: Enter submits the typed name, the button is busy, then it is done", async () => {
    let resolve: (v: unknown) => void = () => {};
    const onSubmit = vi.fn(() => new Promise((r) => (resolve = r)));
    const { input, onDone } = setup(onSubmit);
    fireEvent.change(input, { target: { value: "Poland" } });
    fireEvent.submit(input);
    expect(onSubmit).toHaveBeenCalledWith("Poland");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBe("true");
    expect(input.disabled).toBe(false);
    fireEvent.keyDown(input, { key: "Escape" }); // ignored while saving
    resolve({});
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("unknown name: the server's message under the input, aria-invalid, choice stays open (AC-05)", async () => {
    const { input, onDone } = setup(vi.fn(() => Promise.reject(unknown)));
    fireEvent.change(input, { target: { value: "Polnd" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const message = await screen.findByText("No country matches that name.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(message.id);
    expect(onDone).not.toHaveBeenCalled();
    // Validation is live once flagged: a known name clears it.
    fireEvent.change(input, { target: { value: "poland" } });
    expect(screen.queryByText("No country matches that name.")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("save error: the API message with Retry, the typed name kept", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("INTERNAL", "Something went wrong.", 500))
      .mockResolvedValueOnce({});
    const { input, onDone } = setup(onSubmit);
    fireEvent.change(input, { target: { value: "Poland" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong.");
    expect(input.value).toBe("Poland");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("cancelled: Cancel or Escape closes and sends nothing", () => {
    const onSubmit = vi.fn();
    const { input, onCancel } = setup(onSubmit);
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
