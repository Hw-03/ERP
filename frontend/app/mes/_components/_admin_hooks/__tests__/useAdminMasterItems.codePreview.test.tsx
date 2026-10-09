import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminMasterItems } from "../useAdminMasterItems";

const mocks = vi.hoisted(() => ({ getItemCodePreview: vi.fn(), createItem: vi.fn(), updateItem: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks }));
vi.mock("@/lib/api/items", () => ({ itemsApi: mocks }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount() {
  const args = { items: [], setItems: vi.fn(), globalSearch: "", onStatusChange: vi.fn(), onError: vi.fn(), adminPin: "0000", productModels: [] };
  return { ...renderHook(() => useAdminMasterItems(args), { wrapper }), args };
}

describe("실제 코드 미리보기 제출", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("코드 조회 전 제출을 막고 표시한 정확한 코드를 생성 payload에 함께 전달한다", async () => {
    let finish!: (value: { mes_code: string }) => void;
    mocks.getItemCodePreview.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mocks.createItem.mockResolvedValue({ item_id: "new", item_name: "new", mes_code: "3-TR-0020" });
    const { result } = mount();
    act(() => {
      result.current.setAddMode(true);
      result.current.setAddForm((form) => ({ ...form, item_name: "new", model_slots: [1], initial_locations: [{ department: "창고", quantity: "5" }] }));
    });
    act(() => result.current.addItem());
    expect(mocks.createItem).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.getItemCodePreview).toHaveBeenCalled());
    await act(async () => finish({ mes_code: "3-TR-0020" }));
    act(() => result.current.addItem());
    await waitFor(() => expect(mocks.createItem).toHaveBeenCalledWith(expect.objectContaining({ expected_mes_code: "3-TR-0020", initial_quantity: 5 })));
  });

  it("409 뒤 이름·초기수량을 보존하고 새 미리보기를 확인한 다음 다시 제출한다", async () => {
    mocks.getItemCodePreview.mockResolvedValueOnce({ mes_code: "3-TR-0020" }).mockResolvedValue({ mes_code: "3-TR-0021" });
    mocks.createItem.mockRejectedValueOnce(Object.assign(new Error("품목 코드가 변경됐습니다."), { status: 409 }));
    mocks.createItem.mockResolvedValue({ item_id: "new", item_name: "draft", mes_code: "3-TR-0021" });
    const { result, args } = mount();
    act(() => {
      result.current.setAddMode(true);
      result.current.setAddForm((form) => ({ ...form, item_name: "draft", model_slots: [1], initial_locations: [{ department: "창고", quantity: "5" }] }));
    });
    await waitFor(() => expect(mocks.getItemCodePreview).toHaveBeenCalled());
    await waitFor(() => expect(result.current.addCodePreview.code).toBe("3-TR-0020"));
    await act(async () => { result.current.addItem(); });
    await waitFor(() => expect(args.onError).toHaveBeenCalled());
    expect(result.current.addMode).toBe(true);
    expect(result.current.addForm.item_name).toBe("draft");
    expect(result.current.addForm.initial_locations).toEqual([{ department: "창고", quantity: "5" }]);
    await waitFor(() => expect(mocks.getItemCodePreview).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.addCodePreview.code).toBe("3-TR-0021"));
    await act(async () => { result.current.addItem(); });
    await waitFor(() => expect(mocks.createItem).toHaveBeenLastCalledWith(expect.objectContaining({ expected_mes_code: "3-TR-0021" })));
  });
});
