// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useIoWorkState } from "../useIoWorkState";
import { IO_WORK_TYPES, IO_SUB_TYPES, pickerDirectionLabel } from "../ioWorkType";

describe("원자재 입출고", () => {
  it("입출고 카드와 출고 작업을 제공한다", () => {
    expect(IO_WORK_TYPES.find((row) => row.id === "receive")?.label).toBe("원자재 입출고");
    expect(IO_SUB_TYPES.receive.map((row) => row.id)).toEqual(["receive_supplier", "outbound_supplier"]);
    expect(pickerDirectionLabel("outbound_supplier")).toBe("출고");
  });

  it("원자재 작업만 방향 선택을 거쳐 기존 단계 ID로 진행한다", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => result.current.setWorkType("receive"));
    act(() => result.current.goNext());
    expect(result.current.step).toBe(6);
    expect(result.current.canAdvance[6]).toBe(false);
    act(() => result.current.setSubType("outbound_supplier"));
    expect(result.current.canAdvance[6]).toBe(true);
    act(() => result.current.goNext());
    expect(result.current.step).toBe(2);
    act(() => result.current.goPrev());
    expect(result.current.step).toBe(6);
    act(() => result.current.setWorkType("warehouse_io"));
    act(() => result.current.goNext());
    expect(result.current.step).toBe(2);
  });

  it("방향을 바꿀 때 선택 업체와 사유를 보존하고 품목을 초기화한다", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setWorkType("receive");
      result.current.setSupplier({ supplier_id: "supplier-1", name: "수령 업체" });
      result.current.setNotes("사급 출고");
      result.current.setBundles([{ bundle_id: "b1", source_kind: "direct_item", title: "자재", source_item_id: "i1", quantity: 2, expanded_level: 0, lines: [] }]);
    });
    act(() => result.current.setSubType("outbound_supplier"));
    expect(result.current.bundles).toEqual([]);
    expect(result.current.selectedSupplierId).toBe("supplier-1");
    expect(result.current.notes).toBe("사급 출고");
  });
});
