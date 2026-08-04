import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const createMutateAsync = vi.fn();
const reorderMutate = vi.fn();

vi.mock("@/lib/queries/useItemsQuery", () => ({
  useCreateItemMutation: () => ({ mutateAsync: createMutateAsync }),
  useReorderItemsMutation: () => ({ mutate: reorderMutate }),
}));

import { useAdminMasterItemsCommands } from "../useAdminMasterItemsCommands";

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const baseArgs = (over: Partial<Parameters<typeof useAdminMasterItemsCommands>[0]> = {}) => ({
  setItems: vi.fn(),
  setSelectedItem: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  adminPin: "0000",
  ...over,
});

describe("useAdminMasterItemsCommands", () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
  });

  it("초기 — addMode=false, addForm 빈값", () => {
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.addMode).toBe(false);
    expect(result.current.addForm.item_name).toBe("");
  });

  it("setAddMode 토글", () => {
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddMode(true);
    });
    expect(result.current.addMode).toBe(true);
  });

  it("add — item_name 비어있으면 onError, createMutation 미호출", async () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    await act(async () => {
      result.current.add();
    });
    await waitFor(() => expect(args.onError).toHaveBeenCalledWith("품목명을 입력하세요."));
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("add — 성공 시 setItems/setSelectedItem 호출 + addMode=false", async () => {
    createMutateAsync.mockResolvedValue({
      item_id: "100",
      item_name: "신규",
      mes_code: "N-001",
    });
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args), {
      wrapper: makeWrapper(makeClient()),
    });
    act(() => {
      result.current.setAddMode(true);
      result.current.setAddForm((f) => ({ ...f, item_name: "신규", sales_review_required: true }));
    });
    await act(async () => {
      result.current.add();
    });
    await waitFor(() => expect(args.setItems).toHaveBeenCalled());
    expect(args.setSelectedItem).toHaveBeenCalled();
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ sales_review_required: true }));
    expect(result.current.addMode).toBe(false);
  });

  it("add는 mutation layer가 invalidation을 소유하므로 command에서 중복 무효화하지 않는다", async () => {
    createMutateAsync.mockResolvedValue({
      item_id: "101",
      item_name: "New item",
      mes_code: "N-101",
    });
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()), {
      wrapper: makeWrapper(client),
    });
    act(() => {
      result.current.setAddForm((form) => ({ ...form, item_name: "New item" }));
    });

    await act(async () => {
      result.current.add();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
