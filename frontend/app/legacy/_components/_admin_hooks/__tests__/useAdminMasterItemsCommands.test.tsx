import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const createItemMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    createItem: (...a: any[]) => createItemMock(...a),
  },
}));

import { useAdminMasterItemsCommands } from "../useAdminMasterItemsCommands";

const baseArgs = (over: Partial<Parameters<typeof useAdminMasterItemsCommands>[0]> = {}) => ({
  setItems: vi.fn(),
  setSelectedItem: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  ...over,
});

describe("useAdminMasterItemsCommands", () => {
  beforeEach(() => {
    createItemMock.mockReset();
  });

  it("초기 — addMode=false, addForm 빈값", () => {
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()));
    expect(result.current.addMode).toBe(false);
    expect(result.current.addForm.item_name).toBe("");
  });

  it("setAddMode 토글", () => {
    const { result } = renderHook(() => useAdminMasterItemsCommands(baseArgs()));
    act(() => {
      result.current.setAddMode(true);
    });
    expect(result.current.addMode).toBe(true);
  });

  it("add — item_name 비어있으면 onError, createItem 미호출", async () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args));
    await act(async () => {
      result.current.add();
    });
    await waitFor(() => expect(args.onError).toHaveBeenCalledWith("품목명을 입력하세요."));
    expect(createItemMock).not.toHaveBeenCalled();
  });

  it("add — 성공 시 setItems/setSelectedItem 호출 + addMode=false", async () => {
    createItemMock.mockResolvedValue({
      item_id: "100",
      item_name: "신규",
      item_code: "N-001",
    });
    const args = baseArgs();
    const { result } = renderHook(() => useAdminMasterItemsCommands(args));
    act(() => {
      result.current.setAddMode(true);
      result.current.setAddForm((f) => ({ ...f, item_name: "신규" }));
    });
    await act(async () => {
      result.current.add();
    });
    await waitFor(() => expect(args.setItems).toHaveBeenCalled());
    expect(args.setSelectedItem).toHaveBeenCalled();
    expect(result.current.addMode).toBe(false);
  });
});
