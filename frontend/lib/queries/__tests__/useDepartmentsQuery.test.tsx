/**
 * W7-1 — useDepartmentsQuery 단위 테스트.
 *
 * React Query hook 5종을 fetch mock + QueryClientProvider wrapper로 검증.
 *  1) useDepartmentsQuery: 마운트 시 departmentsApi.getDepartments 호출 + data 반환
 *  2) useCreateDepartmentMutation: 성공 시 departments invalidate
 *  3) useUpdateDepartmentMutation: PUT + invalidate
 *  4) useDeleteDepartmentMutation: DELETE + invalidate
 *  5) useReorderDepartmentsMutation: PATCH + invalidate
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateDepartmentMutation,
  useDeleteDepartmentMutation,
  useDepartmentsQuery,
  useReorderDepartmentsMutation,
  useUpdateDepartmentMutation,
} from "../useDepartmentsQuery";
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

describe("useDepartmentsQuery", () => {
  it("마운트 시 GET /api/departments 호출 + data 반환", async () => {
    const sample = [
      { id: 1, name: "AS1", display_order: 0, is_active: true, color_hex: "#000" },
    ];
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(sample)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const { result } = renderHook(() => useDepartmentsQuery({ isActive: true }), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(sample);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/departments");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("is_active=true");
  });
});

describe("useCreateDepartmentMutation", () => {
  it("성공 시 departments query를 invalidate + POST", async () => {
    const created = { id: 3, name: "NEW", display_order: 2, is_active: true };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(created)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateDepartmentMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({ name: "NEW", pin: "0000" });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.departments.all }),
    );
  });
});

describe("useUpdateDepartmentMutation", () => {
  it("성공 시 PUT /api/departments/{id} + invalidate", async () => {
    const updated = { id: 7, name: "rename", display_order: 0, is_active: true };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(updated)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateDepartmentMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({ id: 7, payload: { name: "rename", pin: "0000" } });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/departments/7");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.departments.all }),
    );
  });

  it("W11: payload 에 io_enabled 가 PUT body 로 전달됨", async () => {
    const updated = {
      id: 7,
      name: "Tube",
      display_order: 0,
      is_active: true,
      io_enabled: false,
    };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(updated)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();

    const { result } = renderHook(() => useUpdateDepartmentMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({
      id: 7,
      payload: { io_enabled: false, pin: "0000" },
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    const body = JSON.parse(String(init.body));
    expect(body.io_enabled).toBe(false);
    expect(body.pin).toBe("0000");
  });
});

describe("useDeleteDepartmentMutation", () => {
  it("성공 시 DELETE + invalidate + body에 pin", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(null)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useDeleteDepartmentMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({ id: 4, pin: "0000" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/departments/4");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ pin: "0000" });
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.departments.all }),
    );
  });
});

describe("useReorderDepartmentsMutation", () => {
  it("성공 시 PATCH /api/departments/reorder + invalidate", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ ok: true })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useReorderDepartmentsMutation(), {
      wrapper: makeWrapper(client),
    });

    await result.current.mutateAsync({
      items: [
        { id: 1, display_order: 0 },
        { id: 2, display_order: 1 },
      ],
      pin: "0000",
    });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/departments/reorder");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.departments.all }),
    );
  });
});
