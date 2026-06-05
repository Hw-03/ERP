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
