import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppNav } from "./AppNav";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { InlineBanner } from "./InlineBanner";
import { SkeletonRow } from "./SkeletonRow";

describe("shared primitives", () => {
  it("AppNav links the two screens and marks the current one", () => {
    render(
      <MemoryRouter initialEntries={["/sources"]}>
        <AppNav />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Source health" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("Button: pending is disabled with an inline spinner", () => {
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Collect now
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Collect now/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("InlineBanner: renders API text as text and offers Retry", () => {
    const onRetry = vi.fn();
    render(
      <InlineBanner tone="error" title="Couldn't load source health." onRetry={onRetry}>
        {"<b>boom</b>"}
      </InlineBanner>,
    );
    expect(screen.getByRole("alert").textContent).toContain("<b>boom</b>");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("InlineBanner: info and warning tones are status, not alert", () => {
    render(<InlineBanner tone="info" title="Nothing collected yet." />);
    expect(screen.getByRole("status").textContent).toContain("Nothing collected yet.");
  });

  it("Badge and SkeletonRow render", () => {
    render(
      <>
        <Badge tone="problem">Problem</Badge>
        <SkeletonRow />
      </>,
    );
    expect(screen.getByText("Problem")).toBeTruthy();
    expect(screen.getByTestId("skeleton-row").getAttribute("aria-hidden")).toBe("true");
  });
});
