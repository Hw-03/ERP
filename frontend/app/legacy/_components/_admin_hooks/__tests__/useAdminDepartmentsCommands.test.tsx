import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const reorderMutate = vi.fn();

vi.mock("@/lib/queries/useDepartmentsQuery", () => ({
  useCreateDepartmentMutation: () => ({ mutate: createMutate }),
  useUpdateDepartmentMutation: () => ({ mutate: updateMutate }),
  useDeleteDepartmentMutation: () => ({ mutate: deleteMutate }),
  useReorderDepartmentsMutation: () => ({ mutate: reorderMutate }),
}));

vi.mock("../../DepartmentsContext", () => ({
  useRefreshDepartments: () => async () => undefined,
}));

import { useAdminDepartmentsCommands } from "../useAdminDepartmentsCommands";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const D = (id: number, name = `D${id}`, is_active = true, color_hex = "#1d4ed8"): any => ({
  id,
  name,
  is_active,
  display_order: id,
  color_hex,
});

const baseArgs = (over: Partial<Parameters<typeof useAdminDepartmentsCommands>[0]> = {}) => ({
  departments: [],
  setDepartments: vi.fn(),
  selectedDept: null,
  setSelectedDept: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  adminPin: "1234",
  getAddName: () => "",
  onAfterAdd: vi.fn(),
  ...over,
});

describe("useAdminDepartmentsCommands", () => {
  beforeEach(() => {
    createMutate.mockReset();
    updateMutate.mockReset();
    deleteMutate.mockReset();
    reorderMutate.mockReset();
  });

  it("add — 빈 이름이면 createMutation 호출 안 함", () => {
    const args = baseArgs({ getAddName: () => "  " });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });
    act(() => {
      result.current.add();
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("add — 이름 있으면 createMutation.mutate 호출 + onSuccess시 setDepartments", () => {
    const args = baseArgs({ getAddName: () => "신규" });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });
    act(() => {
      result.current.add();
    });
    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload, opts] = createMutate.mock.calls[0]!;
    expect(payload.name).toBe("신규");
    expect(payload.pin).toBe("1234");
    // onSuccess 시뮬레이션
    act(() => {
      opts.onSuccess(D(5, "신규"));
    });
    expect(args.setDepartments).toHaveBeenCalled();
    expect(args.onAfterAdd).toHaveBeenCalled();
    expect(args.onStatusChange).toHaveBeenCalledWith("'신규' 부서를 추가했습니다.");
  });

  it("reorder — items 페이로드 + setDepartments 즉시 호출", () => {
    const args = baseArgs({ departments: [D(1), D(2)] });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });
    act(() => {
      result.current.reorder([D(2), D(1)]);
    });
    expect(args.setDepartments).toHaveBeenCalledTimes(1);
    expect(reorderMutate).toHaveBeenCalledTimes(1);
    expect(reorderMutate.mock.calls[0]![0]).toEqual({
      items: [
        { id: 2, display_order: 0 },
        { id: 1, display_order: 1 },
      ],
      pin: "1234",
    });
  });

  it("updateColor — updateMutation.mutate { id, payload }", () => {
    const args = baseArgs({ departments: [D(1)] });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });
    act(() => {
      result.current.updateColor(1, "#dc2626");
    });
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0]![0]).toEqual({
      id: 1,
      payload: { color_hex: "#dc2626", pin: "1234" },
    });
  });
});
