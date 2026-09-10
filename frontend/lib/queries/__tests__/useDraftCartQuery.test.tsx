/**
 * useDraftCartQuery 단위 테스트 — fetch mock + QueryClientProvider.
 *  1) useDraftCartQuery: stock draft + io draft 를 Promise.all 로 합쳐 반환
 *  2) employeeId 없으면 비활성(fetch 안 함)
 *  3) useDeleteStockRequestDraftMutation: DELETE + stockRequests invalidate
 *  4) useDeleteIoDraftMutation: DELETE + stockRequests invalidate
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { StockRequest } from "@/lib/api";
import type { components } from "@/lib/api/generated/openapi";
import {
  useDeleteIoDraftMutation,
  useDeleteStockRequestDraftMutation,
  useDraftCartQuery,
} from "../useDraftCartQuery";
import { queryKeys } from "../keys";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useDraftCartQuery", () => {
  it("stock draft + io draft 를 합쳐 반환", async () => {
    const stockDraftResponse = {
      created_at: "2026-09-08T00:00:00Z",
      lines: [],
      request_id: "sr1",
      request_type: "raw_receive",
      requester_department: "조립",
      requester_employee_id: "e1",
      requester_name: "작업자",
      requires_warehouse_approval: true,
      status: "draft",
      updated_at: "2026-09-08T00:00:00Z",
    } satisfies components["schemas"]["StockRequestResponse"];
    const stockDraft: StockRequest = {
      ...stockDraftResponse,
      approval_department: null,
      approved_at: null,
      approved_by_employee_id: null,
      approved_by_name: null,
      cancelled_at: null,
      completed_at: null,
      department_approved_at: null,
      department_approved_by_employee_id: null,
      department_approved_by_name: null,
      notes: null,
      operation_batch_id: null,
      reason_category: null,
      reason_memo: null,
      reference_no: null,
      rejected_at: null,
      rejected_by_employee_id: null,
      rejected_by_name: null,
      rejected_reason: null,
      request_code: null,
      requester_department: "조립",
      requires_department_approval: false,
      reserved_at: null,
      submitted_at: null,
    };
    const stockDrafts = [stockDraft];
    const ioDrafts = [{ batch_id: "io1" }];
    const fetchSpy = vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes("/api/io/drafts")
          ? makeResponse(ioDrafts)
          : makeResponse([stockDraftResponse]),
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useDraftCartQuery("e1"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ stockDrafts, ioDrafts });
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/stock-requests/drafts"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/io/drafts"))).toBe(true);
  });

  it("employeeId 없으면 fetch 하지 않음(비활성)", () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();
    renderHook(() => useDraftCartQuery(null), { wrapper: makeWrapper(client) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("draft 삭제 mutation", () => {
  it("useDeleteStockRequestDraftMutation: DELETE + stockRequests invalidate", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useDeleteStockRequestDraftMutation(), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync({ requestId: "sr1", employeeId: "e1" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/stock-requests/draft/sr1");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.stockRequests.all }),
    );
  });

  it("useDeleteIoDraftMutation: DELETE + stockRequests invalidate", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useDeleteIoDraftMutation(), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync({ batchId: "io1", employeeId: "e1" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/io/draft/io1");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.stockRequests.all }),
    );
  });
});
