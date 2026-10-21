import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogApi } from "@/lib/api/catalog";
import { useBomListQuery, useBomQuery, useBomWhereUsedQuery } from "../useBomQuery";

describe("BOM query activation", () => {
  afterEach(() => vi.restoreAllMocks());
  it("fetches only enabled lists and passes cancellation to detail reads", async () => {
    const all = vi.spyOn(catalogApi, "getAllBOM").mockResolvedValue([]);
    const detail = vi.spyOn(catalogApi, "getBOM").mockResolvedValue([]);
    const usage = vi.spyOn(catalogApi, "getBOMWhereUsed").mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(({ enabled }) => ({
      list: useBomListQuery({ enabled }),
      detail: useBomQuery("parent", { enabled }),
      usage: useBomWhereUsedQuery("parent", { enabled: false }),
    }), { initialProps: { enabled: false }, wrapper });
    expect(all).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
    expect(usage).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    expect(all).toHaveBeenCalledTimes(1);
    expect(detail).toHaveBeenCalledWith("parent", expect.any(AbortSignal));
    expect(usage).not.toHaveBeenCalled();
  });
});
