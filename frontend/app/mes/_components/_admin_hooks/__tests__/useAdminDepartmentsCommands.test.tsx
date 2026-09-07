import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const reorderMutateAsync = vi.fn();

vi.mock("@/lib/queries/useDepartmentsQuery", () => ({
  useCreateDepartmentMutation: () => ({ mutateAsync: createMutateAsync }),
  useUpdateDepartmentMutation: () => ({ mutateAsync: updateMutateAsync }),
  useDeleteDepartmentMutation: () => ({ mutateAsync: deleteMutateAsync }),
  useReorderDepartmentsMutation: () => ({ mutateAsync: reorderMutateAsync }),
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
    createMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    reorderMutateAsync.mockReset();
    createMutateAsync.mockResolvedValue(D(5, "신규"));
    updateMutateAsync.mockResolvedValue(D(1));
    deleteMutateAsync.mockResolvedValue(undefined);
    reorderMutateAsync.mockResolvedValue({ ok: true });
  });

  it("add — 빈 이름이면 createMutation 호출 안 함", async () => {
    const args = baseArgs({ getAddName: () => "  " });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });
    await act(async () => {
      await result.current.add();
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("add — 서버 mutation 완료 후 후속 상태와 성공 메시지만 갱신", async () => {
    const args = baseArgs({ getAddName: () => "신규" });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });
    await act(async () => {
      await result.current.add();
    });
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    const [payload] = createMutateAsync.mock.calls[0]!;
    expect(payload.name).toBe("신규");
    expect(payload.pin).toBe("1234");
    expect(args.onAfterAdd).toHaveBeenCalled();
    expect(args.onStatusChange).toHaveBeenCalledWith("'신규' 부서를 추가했습니다.");
  });

  it("reorder — 로컬 미러 없이 서버 mutation에 순서 페이로드를 전달", async () => {
    const args = baseArgs({ departments: [D(1), D(2)] });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });
    await act(async () => {
      await result.current.reorder([D(2), D(1)]);
    });
    expect(reorderMutateAsync).toHaveBeenCalledTimes(1);
    expect(reorderMutateAsync.mock.calls[0]![0]).toEqual({
      items: [
        { id: 2, display_order: 0 },
        { id: 1, display_order: 1 },
      ],
      pin: "1234",
    });
  });

  it("updateColor — updateMutation.mutateAsync { id, payload }", async () => {
    const args = baseArgs({ departments: [D(1)] });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });
    await act(async () => {
      await result.current.updateColor(1, "#dc2626");
    });
    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync.mock.calls[0]![0]).toEqual({
      id: 1,
      payload: { color_hex: "#dc2626", pin: "1234" },
    });
  });

  it("mutation 실패는 성공 상태를 만들지 않고 오류를 노출", async () => {
    updateMutateAsync.mockRejectedValue(new Error("색상 저장 실패"));
    const args = baseArgs({ departments: [D(1)] });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args), { wrapper });

    await act(async () => {
      await result.current.updateColor(1, "#dc2626");
    });

    expect(args.onError).toHaveBeenCalledWith("색상 저장 실패");
    expect(args.onStatusChange).not.toHaveBeenCalled();
  });
});
