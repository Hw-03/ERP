import { describe, expect, it } from "vitest";
import type { Item } from "../../_warehouse_v2/types";
import { defectCartGroupErrors, groupDefectCartLines, insertDefectCartLine } from "../defectCartGroups";

function item(itemId: string, available = 10): Item {
  return {
    item_id: itemId, item_name: itemId, process_type_code: "TR", warehouse_qty: available,
    pending_quantity: 0, unit: "EA",
    locations: [{ department: "튜브", status: "PRODUCTION", quantity: available + 2, pending_quantity: 2, available_quantity: available }],
  } as unknown as Item;
}

describe("사유별 격리 품목 그룹", () => {
  it("품목과 사유 순서를 유지하며 수량을 합산한다", () => {
    const first = item("first");
    const second = item("second");
    const lines = [
      { key: "a", item: first, qty: "3", memo: "A" },
      { key: "b", item: first, qty: "4", memo: "B" },
      { key: "c", item: first, qty: "3", memo: "C" },
      { key: "d", item: second, qty: 2, memo: "D" },
    ];
    const groups = groupDefectCartLines(lines);
    expect(groups.map((group) => [group.item.item_id, group.totalQuantity])).toEqual([["first", 10], ["second", 2]]);
    expect(groups[0].lines).toEqual(lines.slice(0, 3));
    expect(groups[0].lines[1]).toBe(lines[1]);
  });

  it("추가 사유를 해당 품목 마지막 사유 다음에 삽입하고 기존 입력을 보존한다", () => {
    const first = item("first");
    const lines = [{ key: "a", item: first, qty: 3 }, { key: "b", item: item("second"), qty: 7 }];
    const added = { key: "c", item: first, qty: 1 };
    expect(insertDefectCartLine(lines, added)).toEqual([lines[0], added, lines[1]]);
    expect(lines.map((line) => line.key)).toEqual(["a", "b"]);
  });

  it("유효하지 않은 수량을 합계 숫자로 표시하지 않는다", () => {
    for (const qty of ["", "NaN", "0", "-1", Infinity]) {
      expect(groupDefectCartLines([{ key: "a", item: item("first"), qty }])[0].totalQuantity).toBeNull();
    }
  });

  it.each(["warehouse", "production"] as const)("%s 가용 재고를 사유 합계로 검증한다", (source) => {
    const first = item("first", 9);
    const groups = groupDefectCartLines([{ key: "a", item: first, qty: 3 }, { key: "b", item: first, qty: 4 }, { key: "c", item: first, qty: 3 }]);
    expect(defectCartGroupErrors(groups, source).get("first")).toContain("1개 많습니다.");
    expect(defectCartGroupErrors(groupDefectCartLines(groups[0].lines.slice(0, 2)), source).size).toBe(0);
  });

  it("다른 품목의 재고를 합치지 않고 단일 사유 검증은 기존 규칙에 맡긴다", () => {
    const groups = groupDefectCartLines([{ key: "a", item: item("first", 2), qty: 3 }, { key: "b", item: item("second", 100), qty: 1 }]);
    expect(defectCartGroupErrors(groups, "warehouse").size).toBe(0);
  });
});
