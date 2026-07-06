import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWarehouseMapQuery } from "../useWarehouseMapQuery";

function makeResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60_000, gcTime: 5 * 60_000 },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const sampleMap = {
  angles: [{ id: 1, label: "A", angle_type: "angle", rows: 1, layers: 1, jaris_per_cell: 1, pos_x: 0, pos_y: 0, width: 100, height: 100, display_order: 1, is_active: true }],
  boxes: [],
  special_zones: [],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useWarehouseMapQuery", () => {
  it("serves a remount from cache without entering loading state", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sampleMap)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();

    const first = renderHook(() => useWarehouseMapQuery(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(first.result.current.data?.angles).toHaveLength(1));
    first.unmount();

    const callCount = fetchSpy.mock.calls.length;
    const second = renderHook(() => useWarehouseMapQuery(), {
      wrapper: makeWrapper(client),
    });

    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.data?.angles).toHaveLength(1);
    expect(fetchSpy.mock.calls.length).toBe(callCount);
  });
});
