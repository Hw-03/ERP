import { describe, expect, it } from "vitest";
import type { IoBundle, IoLine } from "@/lib/api";
import {
  buildInternalUseBomPreviewTarget,
  internalUseLineEffectLabel,
} from "../internalUseBom";

function line(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "child-1",
    item_id: "item-1",
    item_name: "하위 자재",
    mes_code: null,
    unit: "EA",
    direction: "out",
    from_bucket: "warehouse",
    from_department: null,
    to_bucket: "none",
    to_department: "연구",
    quantity: 4,
    bom_expected: 4,
    included: true,
    selected: true,
    origin: "bom_auto",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    ...overrides,
  };
}

function bundle(lines: IoLine[]): IoBundle {
  return {
    bundle_id: "bundle-1",
    source_kind: "bom_parent",
    title: "상위 자재",
    source_item_id: "parent-1",
    source_mes_code: null,
    quantity: 2,
    expanded_level: 1,
    internal_use_bom_mode: "children_only",
    source_location: "warehouse",
    lines,
  };
}

describe("internalUseBom", () => {
  it("방식 전환은 하위 체크와 조정 수량을 그대로 미리보기 요청에 싣는다", () => {
    const target = buildInternalUseBomPreviewTarget(
      bundle([
        line({ selected: false, included: false, quantity: 7, edited: true }),
        line({ line_id: "child-2", item_id: "item-2", quantity: 4 }),
      ]),
      { mode: "parent_and_children" },
    );

    expect(target.internal_use_bom_mode).toBe("parent_and_children");
    expect(target.component_selections).toEqual([
      { item_id: "item-1", quantity: 7, selected: false },
      { item_id: "item-2", quantity: 4, selected: true },
    ]);
  });

  it("기준 수량 변경은 수동 조정값은 보존하고 미편집 BOM 수량만 비례 계산한다", () => {
    const target = buildInternalUseBomPreviewTarget(
      bundle([
        line({ selected: false, included: false, quantity: 7, edited: true }),
        line({ line_id: "child-2", item_id: "item-2", quantity: 4 }),
      ]),
      { bundleQuantity: 3 },
    );

    expect(target.quantity).toBe(3);
    expect(target.component_selections).toEqual([
      { item_id: "item-1", quantity: 7, selected: false },
      { item_id: "item-2", quantity: 6, selected: true },
    ]);
  });

  it("재입고와 변동 없음은 selected와 실제 반영 방향을 함께 본다", () => {
    expect(
      internalUseLineEffectLabel(
        line({ selected: false, direction: "in", included: true }),
      ),
    ).toBe("소속 부서 재입고");
    expect(
      internalUseLineEffectLabel(line({ selected: false, included: false })),
    ).toBe("변동 없음");
  });
});
