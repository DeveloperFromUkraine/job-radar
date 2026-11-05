import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contractExample } from "../../test/contract";
import { mockApi, renderWithProviders } from "../../test/render";
import { CompaniesCard } from "./CompaniesCard";

const LIST = "GET /api/v1/collector/companies";
const ADD = "POST /api/v1/collector/companies";
const list = contractExample<{ companies: { id: string }[] }>("listCompanies", 200);

describe("SCR-02 company job boards (company-boards)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists each company with its board link, roles and how it was found", async () => {
    mockApi({});
    renderWithProviders(<CompaniesCard />);

    const link = await screen.findByRole("link", { name: "Example Co" });
    expect(link.getAttribute("href")).toBe("https://jobs.ashbyhq.com/example");
    expect(screen.getByText(/2 remote roles · Ashby, found by name/)).toBeTruthy();
    expect(screen.getByText(/not read yet · Greenhouse, added by you/)).toBeTruthy();
  });

  it("adds a company by its site and says when its board is read", async () => {
    const added = list.companies[1];
    const api = mockApi({ [ADD]: { status: 201, body: added } });
    renderWithProviders(<CompaniesCard />);

    fireEvent.change(await screen.findByLabelText("Add a company by its site or job board link"), {
      target: { value: " anotherco.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));

    expect(
      await screen.findByText("Another Co is on the list. Its board is read in the next run."),
    ).toBeTruthy();
    const post = api.fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[1]?.body).toBe(JSON.stringify({ url: "anotherco.com" }));
  });

  it("shows why a company could not be added", async () => {
    mockApi({
      [ADD]: {
        status: 422,
        body: contractExample("addCompany", 422, "not_found"),
      },
    });
    renderWithProviders(<CompaniesCard />);

    fireEvent.change(await screen.findByLabelText("Add a company by its site or job board link"), {
      target: { value: "nowhere.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));

    expect(
      await screen.findByText("No Greenhouse, Lever or Ashby board was found for this company."),
    ).toBeTruthy();
  });

  it("removes a company with an empty JSON body", async () => {
    const id = list.companies[0]?.id as string;
    const api = mockApi({
      [`DELETE /api/v1/collector/companies/${id}`]: { status: 204, body: null },
      [LIST]: [{ body: list }, { body: { companies: list.companies.slice(1) } }],
    });
    renderWithProviders(<CompaniesCard />);

    const row = (await screen.findByRole("link", { name: "Example Co" })).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Remove Example Co" }));

    await waitFor(() => expect(screen.queryByRole("link", { name: "Example Co" })).toBeNull());
    const del = api.fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(del?.[1]?.body).toBe("{}");
  });
});
