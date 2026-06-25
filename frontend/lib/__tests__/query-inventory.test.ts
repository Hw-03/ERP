import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import {
  useInventorySummaryQuery,
  useItemLocationsQuery,
} from "@/lib/queries/useInventoryQuery";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return { client, Wrapper };
}

describe("useInventorySummaryQuery (MSW)", () => {
  it("returns inventory summary", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useInventorySummaryQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_items).toBe(5);
    expect(result.current.data?.total_quantity).toBe(200);
    expect(result.current.data?.process_types).toHaveLength(2);
  });

  it("sets isError on 500", async () => {
    server.use(
      http.get("*/api/inventory/summary", () =>
        HttpResponse.json({ detail: "Internal error" }, { status: 500 }),
      ),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useInventorySummaryQuery(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useItemLocationsQuery (MSW)", () => {
  it("returns item locations", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useItemLocationsQuery("item-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].department).toBe("조립");
    expect(result.current.data?.[0].quantity).toBe(10);
  });

  it("stays idle when itemId is empty", () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useItemLocationsQuery(""), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
