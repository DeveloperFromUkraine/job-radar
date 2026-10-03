import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

// A local stand-in for the job boards: tests never call the real sources.
export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface FakeSources {
  baseUrl: string;
  requests: string[];
  route(path: string, handler: Handler): void;
  close(): Promise<void>;
}

export async function startFakeSources(): Promise<FakeSources> {
  const routes = new Map<string, Handler>();
  const requests: string[] = [];
  const server: Server = createServer(async (req, res) => {
    requests.push(req.url ?? "");
    const path = (req.url ?? "").split("?")[0] ?? "";
    const handler = routes.get(path);
    if (!handler) {
      res.writeHead(404).end();
      return;
    }
    await handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    route: (path, handler) => routes.set(path, handler),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const fixture = (relative: string): string =>
  readFileSync(new URL(`../fixtures/sources/${relative}`, import.meta.url), "utf8");

export const json =
  (body: string, status = 200): Handler =>
  (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" }).end(body);
  };

export const xml =
  (body: string, status = 200): Handler =>
  (_req, res) => {
    res.writeHead(status, { "content-type": "application/rss+xml; charset=utf-8" }).end(body);
  };
