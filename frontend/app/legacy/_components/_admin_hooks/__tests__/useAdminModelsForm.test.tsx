import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAdminModelsForm } from "../useAdminModelsForm";

// react-query mutation hook 들 모킹
const mutateMock = vi.fn();
vi.mock("@/lib/queries/useModelsQuery", () => ({
  useUpdateModelMutation: () => ({ mutate: mutateMock }),
  useCreateModelMutation: () => ({ mutate: vi.fn() }),
  useDeleteModelMutation: () => ({ mutate: vi.fn() }),
  useReorderModelsMutation: () => ({ mutate: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseArgs = (over: Partial<Parameters<typeof useAdminModelsForm>[0]> = {}) => ({
  setProductModels: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  adminPin: "1234",
  ...over,
});

describe("useAdminModelsForm", () => {
  beforeEach(() => {
    mutateMock.mockReset();
  });

  it("초기 상태 — empty form, dirty=false, saving=false", () => {
    const { result } = renderHook(() => useAdminModelsForm(baseArgs()), { wrapper });
    expect(result.current.form).toEqual({ model_name: "", symbol: "" });
    expect(result.current.dirty).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it("initForm 호출 시 base/form 동기화 — dirty=false", () => {
    const { result } = renderHook(() => useAdminModelsForm(baseArgs()), { wrapper });
    act(() => {
      result.current.initForm({ slot: 1, model_name: "ADX", symbol: "A" } as any);
    });
    expect(result.current.form).toEqual({ model_name: "ADX", symbol: "A" });
    expect(result.current.dirty).toBe(false);
  });

  it("setForm 으로 값 변경 시 dirty=true", () => {
    const { result } = renderHook(() => useAdminModelsForm(baseArgs()), { wrapper });
    act(() => {
      result.current.initForm({ slot: 1, model_name: "ADX", symbol: "A" } as any);
    });
    act(() => {
      result.current.setForm((f) => ({ ...f, model_name: "ADX-NEW" }));
    });
    expect(result.current.dirty).toBe(true);
  });

  it("model_name 비어있으면 save 시 onError 호출하고 mutate 안 함", () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminModelsForm(args), { wrapper });
    act(() => {
      result.current.save(1);
    });
    expect(args.onError).toHaveBeenCalledWith("모델명을 입력하세요.");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("save 호출 시 mutation.mutate 호출", () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminModelsForm(args), { wrapper });
    act(() => {
      result.current.initForm({ slot: 1, model_name: "ADX", symbol: "A" } as any);
      result.current.setForm((f) => ({ ...f, model_name: "ADX-2" }));
    });
    act(() => {
      result.current.save(1);
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [payload] = mutateMock.mock.calls[0]!;
    expect(payload).toEqual({
      slot: 1,
      payload: { model_name: "ADX-2", symbol: "A", pin: "1234" },
    });
  });
});
