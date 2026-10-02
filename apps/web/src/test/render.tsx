import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

export function renderWithProviders(ui: ReactElement, { route = "/" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

type Reply = { status?: number; body: unknown };

/** Stubs fetch: each path answers with the queued replies in order, repeating the last one. */
export function mockApi(routes: Record<string, Reply | Reply[]>) {
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
