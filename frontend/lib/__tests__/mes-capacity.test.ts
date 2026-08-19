import { describe, it, expect } from "vitest";
import {
  getInitialPfVariant,
  groupAfByModel,
  groupPfVariantsByModel,
} from "@/lib/mes/capacity";
import type {
  ProductionCapacityAfBlock,
  ProductionCapacityAfItem,
  ProductionCapacityPfVariant,
} from "@/lib/api/types/production";

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

function mkPf(
  p: Partial<ProductionCapacityPfVariant> & { pf_item_id: string },
): ProductionCapacityPfVariant {
  return {
    pf_code: null,
    pf_name: "PF",
    model_symbol: null,
    af_item_id: null,
    ship_ready: 0,
    fast_production: 0,
    total_production: 0,
    bom_status: "complete",
    ...p,
  };
}

function mkAf(
  p: Partial<ProductionCapacityAfBlock> = {},
): ProductionCapacityAfBlock {
  return {
    basis: "AF",
    status: "producible",
    summary: { ship_ready: 0, fast_production: 0, total_production: 0 },
    items: [],
    pf_variants: [],
    auto_representatives: [],
    ...p,
  };
}

function selectDuplicatedPf(
  candidates: Array<Partial<ProductionCapacityPfVariant> & { af_item_id: string }>,
): ProductionCapacityPfVariant {
  return groupPfVariantsByModel(mkAf({
    pf_variants: candidates.map((candidate) => mkPf({
      pf_item_id: "duplicate-pf",
      model_symbol: "4",
      ...candidate,
    })),
  })).at(0)!.variants[0];
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

describe("groupPfVariantsByModel", () => {
  it("모델을 숫자 오름차순으로 정렬하고 미분류를 끝에 둔다", () => {
    const groups = groupPfVariantsByModel(mkAf({
      pf_variants: [
        mkPf({ pf_item_id: "unclassified", model_symbol: "  " }),
        mkPf({ pf_item_id: "eight", model_symbol: "8" }),
        mkPf({ pf_item_id: "three", model_symbol: " 3 " }),
        mkPf({ pf_item_id: "new", model_symbol: "X", pf_name: "신규모델_사양" }),
      ],
    }));

    expect(groups.map((group) => group.key)).toEqual(["3", "8", "X", "미분류"]);
    expect(groups.map((group) => group.label)).toEqual(["DX3000", "SOLO", "신규모델", "미분류"]);
  });

  it("그룹 안의 PF를 코드, 이름, ID 순으로 정렬한다", () => {
    const groups = groupPfVariantsByModel(mkAf({
      pf_variants: [
        mkPf({ pf_item_id: "3", model_symbol: "4", pf_code: "B", pf_name: "가" }),
        mkPf({ pf_item_id: "2", model_symbol: "4", pf_code: "A", pf_name: "나" }),
        mkPf({ pf_item_id: "1", model_symbol: "4", pf_code: null, pf_name: "다" }),
        mkPf({ pf_item_id: "4", model_symbol: "4", pf_code: "A", pf_name: "가" }),
        mkPf({ pf_item_id: "0", model_symbol: "4", pf_code: "A", pf_name: "가" }),
      ],
    }));

    expect(groups[0].variants.map((variant) => variant.pf_item_id)).toEqual(["1", "0", "4", "2", "3"]);
  });

  it("같은 PF가 중복되면 정확히 일치하는 자동 대표 행을 우선한다", () => {
    const autoRow = mkPf({
      pf_item_id: "pf-1", model_symbol: "4", af_item_id: "af-auto", pf_code: "AUTO",
    });
    const autoRepresentative = { ...autoRow };
    const groups = groupPfVariantsByModel(mkAf({
      pf_variants: [
        mkPf({ pf_item_id: "pf-1", model_symbol: "4", af_item_id: "af-high", ship_ready: 99 }),
        autoRow,
      ],
      auto_representatives: [autoRepresentative],
    }));

    expect(autoRepresentative).not.toBe(autoRow);
    expect(groups[0].variants[0].af_item_id).toBe("af-auto");
    expect(groups[0].autoRepresentative?.af_item_id).toBe("af-auto");
  });

  it("자동 대표가 아닌 같은 PF는 수량 순위와 문자열 동률 해소 키로 하나를 고른다", () => {
    expect(selectDuplicatedPf([
      { af_item_id: "total-high", ship_ready: 3, fast_production: 1, total_production: 6 },
      { af_item_id: "total-low", ship_ready: 1, fast_production: 4, total_production: 5 },
    ]).af_item_id).toBe("total-high");
    expect(selectDuplicatedPf([
      { af_item_id: "fast-high", ship_ready: 1, fast_production: 4, total_production: 5 },
      { af_item_id: "fast-low", ship_ready: 2, fast_production: 3, total_production: 5 },
    ]).af_item_id).toBe("fast-high");
    // 합계·total·fast가 동률이면 ship도 필연적으로 동률이다. ship은 합계의 구성값으로 검증한다.
    expect(selectDuplicatedPf([
      { af_item_id: "ship-high", ship_ready: 2, fast_production: 4, total_production: 5 },
      { af_item_id: "ship-low", ship_ready: 1, fast_production: 4, total_production: 5 },
    ]).af_item_id).toBe("ship-high");
    expect(selectDuplicatedPf([
      { af_item_id: "code-z", pf_code: "B", ship_ready: 1, fast_production: 4, total_production: 5 },
      { af_item_id: "code-a", pf_code: "A", ship_ready: 1, fast_production: 4, total_production: 5 },
    ]).af_item_id).toBe("code-a");
    expect(selectDuplicatedPf([
      { af_item_id: "af-z", pf_code: "A", ship_ready: 1, fast_production: 4, total_production: 5 },
      { af_item_id: "af-a", pf_code: "A", ship_ready: 1, fast_production: 4, total_production: 5 },
    ]).af_item_id).toBe("af-a");
    expect(selectDuplicatedPf([
      { af_item_id: "sum-low", ship_ready: 1, fast_production: 1, total_production: 1 },
      { af_item_id: "sum-high", ship_ready: 4, fast_production: 5, total_production: 5 },
    ]).af_item_id).toBe("sum-high");
  });
});

describe("getInitialPfVariant", () => {
  it("그룹 순서에서 첫 자동 대표 PF를 선택한다", () => {
    const groups = groupPfVariantsByModel(mkAf({
      pf_variants: [
        mkPf({ pf_item_id: "pf-3", model_symbol: "3", af_item_id: "af-3" }),
        mkPf({ pf_item_id: "pf-4", model_symbol: "4", af_item_id: "af-4" }),
      ],
      auto_representatives: [mkPf({ pf_item_id: "pf-4", model_symbol: "4", af_item_id: "af-4" })],
    }));

    expect(getInitialPfVariant(groups)?.pf_item_id).toBe("pf-4");
  });

  it("자동 대표가 없으면 첫 그룹의 첫 PF를 선택한다", () => {
    const groups = groupPfVariantsByModel(mkAf({
      pf_variants: [
        mkPf({ pf_item_id: "pf-8", model_symbol: "8" }),
        mkPf({ pf_item_id: "pf-3", model_symbol: "3" }),
      ],
    }));

    expect(getInitialPfVariant(groups)?.pf_item_id).toBe("pf-3");
  });

  it("PF가 없으면 null을 반환한다", () => {
    expect(getInitialPfVariant(groupPfVariantsByModel(mkAf()))).toBeNull();
  });
});
