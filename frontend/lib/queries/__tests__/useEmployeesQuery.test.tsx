/**
 * W7-2 — useEmployeesQuery 단위 테스트.
 *
 * React Query hook 5종을 fetch mock + QueryClientProvider wrapper로 검증.
 *  1) useEmployeesQuery
 *  2) useCreateEmployeeMutation
 *  3) useUpdateEmployeeMutation
 *  4) useDeleteEmployeeMutation
 *  5) useResetEmployeePinMutation
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateEmployeeMutation,
  useDeleteEmployeeMutation,
  useEmployeesQuery,
  useResetEmployeePinMutation,
  useUpdateEmployeeMutation,
} from "../useEmployeesQuery";
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

describe("useEmployeesQuery", () => {
  it("마운트 시 GET /api/employees 호출 + data 반환", async () => {
    const sample = [{ employee_id: "E1", name: "이름", role: "조립", department: "조립" }];
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sample)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useEmployeesQuery({ activeOnly: true }), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sample);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/employees");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("active_only=true");
  });
});

describe("useCreateEmployeeMutation", () => {
  it("성공 시 employees query를 invalidate + POST", async () => {
    const created = { employee_id: "E10", name: "신규" };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(created)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateEmployeeMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({
      name: "신규",
      role: "조립",
      department: "조립" as any,
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.employees.all }),
    );
  });
});

describe("useUpdateEmployeeMutation", () => {
  it("성공 시 PUT /api/employees/{id} + invalidate", async () => {
    const updated = { employee_id: "E5", name: "수정", is_active: false };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(updated)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateEmployeeMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({
      employeeId: "E5",
      payload: { is_active: false },
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/employees/E5");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.employees.all }),
    );
  });
});

describe("useDeleteEmployeeMutation", () => {
  it("성공 시 DELETE + invalidate", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ result: "deleted" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useDeleteEmployeeMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync("E9");

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/employees/E9");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.employees.all }),
    );
  });
});

describe("useResetEmployeePinMutation", () => {
  it("성공 시 POST /api/employees/{id}/reset-pin (invalidate 없음)", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useResetEmployeePinMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({ employeeId: "E1", adminPin: "0000" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/employees/E1/reset-pin");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ pin: "0000" });
    // reset-pin은 employees 캐시 무효화 안 함
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
