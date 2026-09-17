import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAdminMasterItemsList } from "../useAdminMasterItemsList";

const I = (id: string, name: string, code: string): any => ({
  item_id: id,
  item_name: name,
  mes_code: code,
});

describe("useAdminMasterItemsList", () => {
  let items: any[];
  beforeEach(() => {
    items = [I("1", "프로브", "P-001"), I("2", "케이블", "C-002"), I("3", "센서", "S-003")];
  });

  it("globalSearch + itemSearch 모두 빈 문자열 → 전체 노출", () => {
    const { result } = renderHook(() =>
      useAdminMasterItemsList({ items, globalSearch: "" }),
    );
    expect(result.current.visibleItems).toHaveLength(3);
    expect(result.current.canReorderItems).toBe(true);
  });

  it("itemSearch 적용 시 visibleItems 필터링", () => {
    const { result } = renderHook(() =>
      useAdminMasterItemsList({ items, globalSearch: "" }),
    );
    act(() => {
      result.current.setItemSearch("프로브");
    });
    expect(result.current.visibleItems).toHaveLength(1);
    expect(result.current.visibleItems[0]!.item_name).toBe("프로브");
  });

  it("globalSearch 만으로도 필터링", () => {
    const { result } = renderHook(() =>
      useAdminMasterItemsList({ items, globalSearch: "C-002" }),
    );
    expect(result.current.visibleItems).toHaveLength(1);
    expect(result.current.visibleItems[0]!.mes_code).toBe("C-002");
    expect(result.current.canReorderItems).toBe(false);
  });

  it("globalSearch + itemSearch 조합 — 공백으로 합쳐 부분 매치", () => {
    const { result } = renderHook(() =>
      useAdminMasterItemsList({ items, globalSearch: "센서" }),
    );
    // 'globalSearch + itemSearch' 가 'item_name + mes_code' 안에 모두 포함되어야 함.
    expect(result.current.visibleItems.map((i) => i.item_name)).toEqual(["센서"]);
  });

  it("filter 객체에 현재 search 노출", () => {
    const { result } = renderHook(() =>
      useAdminMasterItemsList({ items, globalSearch: "g" }),
    );
    act(() => {
      result.current.setItemSearch("i");
    });
    expect(result.current.filter).toEqual({ itemSearch: "i", globalSearch: "g" });
  });

  it("[8.19-04] 1050개 목록의 마지막 품목도 검색에서 누락되지 않는다", () => {
    const largeItems = Array.from({ length: 1050 }, (_, index) =>
      I(String(index + 1), `품목 ${index + 1}`, `CODE-${String(index + 1).padStart(4, "0")}`),
    );
    const { result } = renderHook(() =>
      useAdminMasterItemsList({ items: largeItems, globalSearch: "" }),
    );

    expect(result.current.visibleItems).toHaveLength(1050);
    act(() => result.current.setItemSearch("CODE-1050"));
    expect(result.current.visibleItems.map((candidate) => candidate.item_id)).toEqual(["1050"]);
  });
});
