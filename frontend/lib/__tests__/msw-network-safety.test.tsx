import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "./msw/server";
import { sendClientEvent } from "../client-events";

// Install before the shared beforeAll starts MSW. A broken bypass policy may
// reach this fake transport, but this regression must never send real traffic.
const transport = vi.hoisted(() => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; method: string }[] = [];
  const nativeFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, method: request.method });
    return new Response(null, { status: 204 });
  };
  globalThis.fetch = nativeFetch;
  return { originalFetch, nativeFetch, requests };
});

beforeAll(() => { expect(globalThis.fetch).not.toBe(transport.nativeFetch); });
beforeEach(() => { transport.requests.length = 0; });
afterAll(() => {
  server.close();
  globalThis.fetch = transport.originalFetch;
});

describe("shared MSW network safety", () => {
  it("handles fire-and-forget audit events without reaching native fetch", async () => {
    const completed = new Promise<Response>((resolve) => {
      const finish = ({ response, request }: { response: Response; request: Request }) => {
        if (new URL(request.url).pathname !== "/api/client-events") return;
        server.events.removeListener("response:mocked", finish);
        server.events.removeListener("response:bypass", finish);
        resolve(response);
      };
      server.events.on("response:mocked", finish);
      server.events.on("response:bypass", finish);
    });

    sendClientEvent({ event: "ui_nav", screen_key: "qa.network-proof", source: "desktop" });

    expect((await completed).status).toBe(204);
    expect(transport.requests).toEqual([]);
  });

  it.each([
    "/api/unmocked-network-proof",
    "http://localhost:8010/api/unmocked-network-proof",
    "http://localhost:8011/api/unmocked-network-proof",
    "https://network-proof.invalid/unmocked",
  ])("rejects unhandled requests without native transport: %s", async (url) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(fetch(url)).rejects.toThrow();
      expect(transport.requests).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });

  it("keeps existing business API fixtures active", async () => {
    const response = await fetch("/api/models");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { slot: 1, symbol: "A", model_name: "DX3000", is_reserved: false, display_order: 0 },
      { slot: 2, symbol: "B", model_name: "COCOON", is_reserved: false, display_order: 1 },
    ]);
    expect(transport.requests).toEqual([]);
  });
});
