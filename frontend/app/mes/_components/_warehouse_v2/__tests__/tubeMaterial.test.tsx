import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { approvalKind, canSeeWorkType, DEFAULT_SUB_TYPE, getItemActionMode, ioDepartmentPayload, isValidTubeMaterialItem, singleItemSourceKind, targetDepartmentOf } from "../ioWorkType";
import { useIoWorkState } from "../useIoWorkState";
import { useIoPreselect } from "../useIoPreselect";
import type { Item, IoSubType, IoWorkType } from "@/lib/api";

const tube = "tube_material" as IoWorkType;
const receive = "tube_receive_supplier" as IoSubType;
const outbound = "tube_outbound_supplier" as IoSubType;

describe("튜브 원자재 입출고", () => {
  it("튜브 소속에게만 허용하고 기존 원자재 권한은 유지한다", () => {
    expect(canSeeWorkType(tube, { department: "튜브", warehouse_role: "none" })).toBe(true);
    expect(canSeeWorkType(tube, { department: "조립", warehouse_role: "primary" })).toBe(false);
    expect(canSeeWorkType(tube, null)).toBe(false);
    expect(canSeeWorkType("receive", { department: "튜브", warehouse_role: "none" })).toBe(false);
  });
  it("튜브 부서의 낱개 입출고는 BOM과 결재 없이 처리한다", () => {
    expect(DEFAULT_SUB_TYPE[tube]).toBe(receive);
    for (const subType of [receive, outbound]) {
      expect(singleItemSourceKind(subType)).toBe("direct_item");
      expect(getItemActionMode(subType)).toBe("single_only");
      expect(approvalKind(subType, [])).toBe("none");
      expect(targetDepartmentOf(subType, "조립", "고압")).toBe("튜브");
      expect(ioDepartmentPayload(subType, "조립", "고압")).toEqual({ fromDepartment: null, toDepartment: null });
    }
  });
  it("방향·업체·품목·수량 순서와 업체 재검증을 공유한다", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => result.current.setWorkType(tube));
    expect(result.current.steps).toEqual([1, 6, 2, 3, 4, 5]);
    expect(result.current.canAdvance[6]).toBe(false);
    expect(result.current.canAdvance[2]).toBe(false);
    act(() => result.current.setSubType(outbound));
    expect(result.current.canAdvance[6]).toBe(true);
    act(() => result.current.setSupplier({ supplier_id: "tube-supplier", name: "튜브 업체" }));
    expect(result.current.canAdvance[2]).toBe(false);
    act(() => result.current.setSupplierSelectionReady(true));
    expect(result.current.canAdvance[2]).toBe(true);
  });
  it.each(["AR", "TF"])("빠른 진입의 %s 품목을 추가하지 않는다", (code) => {
    const addItem = vi.fn();
    renderHook(() => useIoPreselect({ preselectedItem: { item_id: "wrong", process_type_code: code } as Item, bomParents: new Set(), bomParentsLoaded: true, workType: tube, subType: receive, fromDepartment: null, toDepartment: null, deptIoDirection: null, addItem, setHighlightItemId: vi.fn() }));
    expect(addItem).not.toHaveBeenCalled();
  });
  it("TR 품목도 삭제 상태라면 선택하지 않는다", () => {
    expect(isValidTubeMaterialItem({ process_type_code: "TR", deleted_at: "2026-10-08" })).toBe(false);
    expect(isValidTubeMaterialItem({ process_type_code: "TR", deleted_at: null })).toBe(true);
  });
  it("TR은 BOM 목록 대기 없이 직접 선택한다", () => {
    const addItem = vi.fn();
    renderHook(() => useIoPreselect({ preselectedItem: { item_id: "tr", process_type_code: "TR" } as Item, bomParents: new Set(["tr"]), bomParentsLoaded: false, workType: tube, subType: receive, fromDepartment: null, toDepartment: null, deptIoDirection: null, addItem, setHighlightItemId: vi.fn() }));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ item_id: "tr" }));
  });
});
