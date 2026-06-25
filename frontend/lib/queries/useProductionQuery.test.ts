import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useProductionCapacityQuery,
  useProductionReceiptMutation,
} from "./useProductionQuery";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

describe("useProductionCapacityQuery", () => {
  it("returns production capacity data", async () => {
    const { result } = renderHook(() => useProductionCapacityQuery(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});

describe("useProductionReceiptMutation", () => {
  it("submits production receipt", async () => {
    const { result } = renderHook(() => useProductionReceiptMutation(), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ item_id: "i-1", quantity: 5 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
