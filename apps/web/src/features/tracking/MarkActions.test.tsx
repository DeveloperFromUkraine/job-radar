import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkActions } from "./MarkActions";

const TITLE = "Senior Backend Engineer";

describe("MarkActions (SCR-01 NEW: MarkActions)", () => {
  it("offers Applied and Skipped on an unmarked card, named for the posting (AC-01, AC-02)", () => {
    const onChoose = vi.fn();
    render(<MarkActions title={TITLE} mark={null} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: `Mark ${TITLE} applied` }));
    fireEvent.click(screen.getByRole("button", { name: `Mark ${TITLE} skipped` }));
    expect(onChoose.mock.calls).toEqual([["applied"], ["skipped"]]);
    expect(screen.getByRole("button", { name: `Mark ${TITLE} applied` }).textContent).toBe("Applied");
  });

  it("lays the pair out as two 44 px columns 8 px apart (spec §6 Phone layout)", () => {
    const { container } = render(<MarkActions title={TITLE} mark={null} onChoose={() => {}} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("gap-2");
    for (const b of screen.getAllByRole("button")) expect(b.className).toContain("min-h-11");
  });

  it("offers the other mark and Clear on a marked card (AC-06)", () => {
    const onChoose = vi.fn();
    render(<MarkActions title={TITLE} mark="applied" onChoose={onChoose} />);
    expect(screen.queryByRole("button", { name: `Mark ${TITLE} applied` })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Mark ${TITLE} skipped` }));
    fireEvent.click(screen.getByRole("button", { name: `Clear the mark on ${TITLE}` }));
    expect(onChoose.mock.calls).toEqual([["skipped"], [null]]);
  });

  it("shows the pressed action pending and disables the other while a call is in flight", () => {
    render(<MarkActions title={TITLE} mark={null} pending="skipped" onChoose={() => {}} />);
    const skipped = screen.getByRole("button", { name: `Mark ${TITLE} skipped` }) as HTMLButtonElement;
    const applied = screen.getByRole("button", { name: `Mark ${TITLE} applied` }) as HTMLButtonElement;
    expect(skipped.getAttribute("aria-busy")).toBe("true");
    expect(applied.disabled).toBe(true);
    expect(skipped.disabled).toBe(true);
  });

  it("asks before losing applied protection, with Continue and Cancel (AC-07)", () => {
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    render(
      <MarkActions title={TITLE} mark="applied" onChoose={() => {}} confirm={{ onContinue, onCancel }} />,
    );
    const warning = screen.getByText("Without the applied mark, this posting will be removed at clean-up.");
    expect(warning.closest("[class*='border-danger']")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: `Clear the mark on ${TITLE}` })).toBeNull();
  });
});
