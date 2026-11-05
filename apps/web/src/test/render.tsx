import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { contractExample } from "./contract";

export function renderWithProviders(ui: ReactElement, { route = "/" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

type Reply = { status?: number; body: unknown };

// Every main screen reads the location settings and scoring health; unless a test says otherwise, no
// country is chosen, a profile is set up and scoring is healthy.
const DEFAULTS = (): Record<string, Reply | Reply[]> => ({
  "GET /api/v1/remote-filter/settings": {
    body: contractExample("getRemoteFilterSettings", 200, "first_open"),
  },
  "GET /api/v1/matching/health": { body: contractExample("getScoringHealth", 200, "healthy") },
  "GET /api/v1/matching/settings": { body: contractExample("getMatchingSettings", 200, "with_profile") },
  "GET /api/v1/collector/companies": { body: contractExample("listCompanies", 200) },
});

/** Stubs fetch: each path answers with the queued replies in order, repeating the last one. */
export function mockApi(overrides: Record<string, Reply | Reply[]>) {
  const routes = { ...DEFAULTS(), ...overrides };
  const calls: { method: string; path: string }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, path });
    const entry = routes[`${method} ${path}`];
    if (!entry)
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: path } }), { status: 404 });
    const queue = Array.isArray(entry) ? entry : [entry];
    const reply = queue.length > 1 ? (queue.shift() as Reply) : (queue[0] as Reply);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}
