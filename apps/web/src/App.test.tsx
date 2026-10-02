import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { contractExample } from "./test/contract";
import { mockApi, renderWithProviders } from "./test/render";

describe("App", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the app shell with its navigation", () => {
    mockApi({
      "GET /api/v1/collector/problems": { body: contractExample("getCollectorProblems", 200, "none") },
    });
    renderWithProviders(<App />);

    expect(screen.getByText("job-radar")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });
});
