import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAdminModelsCommands } from "../useAdminModelsCommands";

const createMutate = vi.fn();
const deleteMutate = vi.fn();
const reorderMutate = vi.fn();

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useCreateModelMutation: () => ({ mutate: createMutate }),
  useDeleteModelMutation: () => ({ mutate: deleteMutate }),
  useReorderModelsMutation: () => ({ mutate: reorderMutate }),
  useUpdateModelMutation: () => ({ mutate: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseArgs = (over: Partial<Parameters<typeof useAdminModelsCommands>[0]> = {}) => ({
  productModels: [],
  setProductModels: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  adminPin: "1234",
  ...over,
});

describe("useAdminModelsCommands", () => {
  beforeEach(() => {
    createMutate.mockReset();
    deleteMutate.mockReset();
    reorderMutate.mockReset();
  });

  it("modelAddName/modelAddSymbol 초기값은 빈 문자열", () => {
    const { result } = renderHook(() => useAdminModelsCommands(baseArgs()), { wrapper });
    expect(result.current.modelAddName).toBe("");
    expect(result.current.modelAddSymbol).toBe("");
  });

  it("add — 이름 비어있으면 mutate 호출 안 함", () => {
    const { result } = renderHook(() => useAdminModelsCommands(baseArgs()), { wrapper });
    act(() => {
      result.current.add();
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("add — 이름 있으면 createMutation.mutate 호출", () => {
    const { result } = renderHook(() => useAdminModelsCommands(baseArgs()), { wrapper });
    act(() => {
      result.current.setModelAddName("ADX");
      result.current.setModelAddSymbol("A");
    });
    act(() => {
      result.current.add();
    });
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]![0]).toEqual({ model_name: "ADX", symbol: "A" });
  });

  it("delete — native confirm 없이 PIN을 유지하고 중복 제출을 막는다", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const args = baseArgs({
      productModels: [{ slot: 1, model_name: "DX3000" } as any],
    });
    const { result } = renderHook(() => useAdminModelsCommands(args), { wrapper });

    act(() => {
      result.current.delete(1);
      result.current.delete(1);
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0]![0]).toEqual({ slot: 1, pin: "1234" });
    expect(result.current.deletingSlot).toBe(1);
    confirmSpy.mockRestore();
  });

  it("delete — 실패하면 모델과 PIN을 유지하고 같은 모델을 다시 시도할 수 있다", () => {
    const args = baseArgs({
      productModels: [{ slot: 1, model_name: "DX3000" } as any],
    });
    const { result } = renderHook(() => useAdminModelsCommands(args), { wrapper });

    act(() => result.current.delete(1));
    act(() => deleteMutate.mock.calls[0]![1].onError(new Error("삭제 거절")));

    expect(args.setProductModels).not.toHaveBeenCalled();
    expect(args.onError).toHaveBeenCalledWith("삭제 거절");
    expect(result.current.deletingSlot).toBeNull();
    act(() => result.current.delete(1));
    expect(deleteMutate.mock.calls[1]![0]).toEqual({ slot: 1, pin: "1234" });
  });

  it("reorder — 로컬 setProductModels 즉시 호출 + mutation.mutate 호출", () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminModelsCommands(args), { wrapper });
    const models = [
      { slot: 1, model_name: "A" } as any,
      { slot: 2, model_name: "B" } as any,
    ];
    act(() => {
      result.current.reorder(models);
    });
    expect(args.setProductModels).toHaveBeenCalledTimes(1);
    expect(reorderMutate).toHaveBeenCalledTimes(1);
    expect(reorderMutate.mock.calls[0]![0]).toEqual({
      items: [
        { slot: 1, display_order: 0 },
        { slot: 2, display_order: 1 },
      ],
      pin: "1234",
    });
  });
});
