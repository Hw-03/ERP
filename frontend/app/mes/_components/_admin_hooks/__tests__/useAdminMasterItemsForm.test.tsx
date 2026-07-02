import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const updateItemMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    updateItem: (...a: any[]) => updateItemMock(...a),
  },
}));

import { useAdminMasterItemsForm } from "../useAdminMasterItemsForm";

const I = (over: Partial<any> = {}): any => ({
  item_id: "1",
  item_name: "프로브",
  mes_code: "P-001",
  process_type_code: "TR",
  unit: "EA",
  model_slots: [],
  ...over,
});

const baseArgs = (over: Partial<Parameters<typeof useAdminMasterItemsForm>[0]> = {}) => ({
  selectedItem: null,
  setSelectedItem: vi.fn(),
  setItems: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  ...over,
});

describe("useAdminMasterItemsForm", () => {
  beforeEach(() => {
    updateItemMock.mockReset();
  });

  it("selectedItem null → 빈 form, dirty=false", () => {
    const { result } = renderHook(() => useAdminMasterItemsForm(baseArgs()));
    expect(result.current.form.item_name).toBe("");
    expect(result.current.dirty).toBe(false);
  });

  it("selectedItem 주어지면 form 자동 채워짐, dirty=false", () => {
    const item = I();
    const { result } = renderHook(() =>
      useAdminMasterItemsForm(baseArgs({ selectedItem: item })),
    );
    expect(result.current.form.item_name).toBe("프로브");
    expect(result.current.form.mes_code).toBe("P-001");
    expect(result.current.dirty).toBe(false);
  });

  it("setForm 호출 시 dirty=true", () => {
    const { result } = renderHook(() =>
      useAdminMasterItemsForm(baseArgs({ selectedItem: I() })),
    );
    act(() => {
      result.current.setForm((f) => ({ ...f, item_name: "변경됨" }));
    });
    expect(result.current.dirty).toBe(true);
  });

  it("save — selectedItem 없으면 updateItem 호출 안 함", async () => {
    const { result } = renderHook(() => useAdminMasterItemsForm(baseArgs()));
    await act(async () => {
      await result.current.save();
    });
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("save — 성공 시 setItems/setSelectedItem 호출 + dirty=false", async () => {
    const updated = I({ item_name: "변경됨" });
    updateItemMock.mockResolvedValue(updated);
    const args = baseArgs({ selectedItem: I() });
    const { result } = renderHook(() => useAdminMasterItemsForm(args));
    act(() => {
      result.current.setForm((f) => ({ ...f, item_name: "변경됨" }));
    });
    expect(result.current.dirty).toBe(true);
    await act(async () => {
      await result.current.save();
    });
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(args.setItems).toHaveBeenCalled();
    expect(args.setSelectedItem).toHaveBeenCalledWith(updated);
  });

  it("emits item-change event after save success", async () => {
    const updated = I({ item_name: "Changed" });
    updateItemMock.mockResolvedValue(updated);
    const onItemsChanged = vi.fn();
    window.addEventListener("items", onItemsChanged);
    const { result } = renderHook(() => useAdminMasterItemsForm(baseArgs({ selectedItem: I() })));

    await act(async () => {
      await result.current.save();
    });

    await waitFor(() => expect(onItemsChanged).toHaveBeenCalledTimes(1));
    window.removeEventListener("items", onItemsChanged);
  });
});
