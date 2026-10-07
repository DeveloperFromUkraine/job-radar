import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "./mutations";
import { UndoNotice } from "./UndoNotice";

const notice: Notice = { kind: "marked", postingId: "p", mark: "applied", changeId: "c1" };

describe("UndoNotice (spec §6 Undo window)", () => {
  afterEach(() => vi.useRealTimers());

  it("closes after 8 s even when the screen re-renders it with a new onClose meanwhile", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<UndoNotice notice={notice} onUndo={() => {}} onClose={first} />);
    act(() => vi.advanceTimersByTime(5_000));
    rerender(<UndoNotice notice={notice} onUndo={() => {}} onClose={second} />);
    act(() => vi.advanceTimersByTime(2_999));
    expect(second).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
});
