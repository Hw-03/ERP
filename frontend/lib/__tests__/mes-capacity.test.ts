import { describe, it, expect } from "vitest";
import { groupAfByModel } from "@/lib/mes/capacity";
import type { ProductionCapacityAfItem } from "@/lib/api/types/production";

function mk(p: Partial<ProductionCapacityAfItem> & { af_item_id: string }): ProductionCapacityAfItem {
  return {
    af_code: null,
    af_name: p.af_name ?? "AF",
    model_symbol: null,
    ship_ready: 0,
    fast_production: 0,
    total_production: 0,
    ship_ready_limiting_item: null,
    fast_production_limiting_item: null,
    total_production_limiting_item: null,
    bom_status: "complete",
    has_direct_children: true,
    has_pf_path: true,
    marked_complete: false,
    ...p,
  };
}

describe("groupAfByModel", () => {
  it("모델별로 묶고 3수량을 합산한다", () => {
    const groups = groupAfByModel([
      mk({ af_item_id: "a", model_symbol: "4", ship_ready: 100, fast_production: 200, total_production: 300 }),
      mk({ af_item_id: "b", model_symbol: "4", ship_ready: 50, fast_production: 100, total_production: 150 }),
      mk({ af_item_id: "c", model_symbol: "3", ship_ready: 10, fast_production: 20, total_production: 30 }),
    ]);

    const m4 = groups.find((g) => g.key === "4")!;
    expect(m4.totals).toEqual({ ship_ready: 150, fast_production: 300, total_production: 450 });
    expect(m4.items).toHaveLength(2);

    const m3 = groups.find((g) => g.key === "3")!;
    expect(m3.totals).toEqual({ ship_ready: 10, fast_production: 20, total_production: 30 });
  });

  it("model_symbol 표시명을 getModelLabel 로 매핑한다", () => {
    const groups = groupAfByModel([mk({ af_item_id: "a", model_symbol: "4" })]);
    expect(groups[0].label).toBe("ADX4000W");
  });

  it("model_symbol 없으면 미분류로 묶고 항상 끝에 둔다", () => {
    const groups = groupAfByModel([
      mk({ af_item_id: "a", model_symbol: null }),
      mk({ af_item_id: "b", model_symbol: "8" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["8", "미분류"]);
    expect(groups[1].label).toBe("미분류");
  });

  it("모델 키를 숫자 오름차순으로 정렬한다", () => {
    const groups = groupAfByModel([
      mk({ af_item_id: "a", model_symbol: "8" }),
      mk({ af_item_id: "b", model_symbol: "3" }),
      mk({ af_item_id: "c", model_symbol: "6" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["3", "6", "8"]);
  });

  it("그룹 내부 항목은 ship_ready 내림차순", () => {
    const groups = groupAfByModel([
      mk({ af_item_id: "low", model_symbol: "4", ship_ready: 5 }),
      mk({ af_item_id: "high", model_symbol: "4", ship_ready: 90 }),
    ]);
    expect(groups[0].items.map((it) => it.af_item_id)).toEqual(["high", "low"]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(groupAfByModel([])).toEqual([]);
  });
});
