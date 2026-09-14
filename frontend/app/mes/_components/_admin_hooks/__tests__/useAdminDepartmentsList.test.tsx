import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/queries/useDepartmentsQuery", () => ({
  useCreateDepartmentMutation: () => ({ mutate: vi.fn() }),
  useUpdateDepartmentMutation: () => ({ mutate: vi.fn() }),
  useDeleteDepartmentMutation: () => ({ mutate: vi.fn() }),
  useReorderDepartmentsMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock("../../DepartmentsContext", () => ({
  useRefreshDepartments: () => async () => undefined,
}));

import { useAdminDepartments } from "../useAdminDepartments";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const D = (id: number, name = `D${id}`, is_active = true): any => ({
  id,
  name,
  is_active,
  display_order: id,
});

const baseArgs = (over: Partial<Parameters<typeof useAdminDepartments>[0]> = {}) => ({
  departments: [] as any[],
  setDepartments: vi.fn(),
  selectedDept: null,
  setSelectedDept: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  adminPin: "1234",
  ...over,
});

// List(pass-through) 동작 검증 — useAdminDepartmentsList 통합 후 useAdminDepartments.departments 표면으로 확인.
describe("useAdminDepartments — list pass-through", () => {
  it("빈 입력 처리", () => {
    const { result } = renderHook(() => useAdminDepartments(baseArgs({ departments: [] })), {
      wrapper,
    });
    expect(result.current.departments).toEqual([]);
  });

  it("pass-through", () => {
    const depts = [D(1), D(2)];
    const { result } = renderHook(() => useAdminDepartments(baseArgs({ departments: depts })), {
      wrapper,
    });
    expect(result.current.departments).toEqual(depts);
  });

  it("입력 변경 시 동기화", () => {
    const { result, rerender } = renderHook(
      ({ departments }) => useAdminDepartments(baseArgs({ departments })),
      { wrapper, initialProps: { departments: [D(1)] } },
    );
    expect(result.current.departments).toHaveLength(1);
    rerender({ departments: [D(1), D(2), D(3)] });
    expect(result.current.departments).toHaveLength(3);
  });

  it("같은 reference 시 departments 메모이즈", () => {
    const depts = [D(1)];
    const { result, rerender } = renderHook(
      ({ departments }) => useAdminDepartments(baseArgs({ departments })),
      { wrapper, initialProps: { departments: depts } },
    );
    const first = result.current.departments;
    rerender({ departments: depts });
    expect(result.current.departments).toBe(first);
  });
});
