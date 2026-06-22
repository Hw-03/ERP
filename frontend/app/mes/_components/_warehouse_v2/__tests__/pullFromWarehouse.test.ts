/**
 * 항목 7 — '창고에서 가져오기' 순수 로직 단위 테스트.
 *
 * warehouseFlow.golden 의 makeBundle/makeLine 픽스처 패턴을 따른다.
 * collectShortageItemIds: included && shortage>0 수집, 선택 없으면 전체, item_id dedupe.
 */
import { describe, it, expect } from "vitest";
import type { IoBundle, IoLine } from "@/lib/api/types/io";
import { collectShortageItemIds, shortageLines } from "../pullFromWarehouse";

function makeLine(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "l1",
    item_id: "ITEM-001",
    item_name: "테스트 부품",
    mes_code: null,
    unit: "EA",
    direction: "in",
    from_bucket: "none",
    from_department: null,
    to_bucket: "warehouse",
    to_department: null,
    quantity: 10,
    bom_expected: null,
    included: true,
    origin: "direct",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    ...overrides,
  };
}

function makeBundle(overrides: Partial<IoBundle> & { lines?: IoLine[] } = {}): IoBundle {
  return {
    bundle_id: "b1",
    source_kind: "direct_item",
    title: "테스트 번들",
    source_item_id: null,
    source_mes_code: null,
    quantity: 10,
    expanded_level: 0,
    lines: [],
    ...overrides,
  };
}

describe("shortageLines", () => {
  it("included && shortage>0 인 라인만", () => {
    const bundles = [
      makeBundle({
        lines: [
          makeLine({ line_id: "A", shortage: 5, included: true }),
          makeLine({ line_id: "B", shortage: 0, included: true }), // 부족 아님
          makeLine({ line_id: "C", shortage: 3, included: false }), // 제외됨
        ],
      }),
    ];
    expect(shortageLines(bundles).map((l) => l.line_id)).toEqual(["A"]);
  });
});

describe("collectShortageItemIds", () => {
  it("선택 없음 → 부족 라인 전체 item_id", () => {
    const bundles = [
      makeBundle({
        lines: [
          makeLine({ line_id: "A", item_id: "I-1", shortage: 5 }),
          makeLine({ line_id: "B", item_id: "I-2", shortage: 2 }),
          makeLine({ line_id: "C", item_id: "I-3", shortage: 0 }), // 부족 아님 → 제외
        ],
      }),
    ];
    expect(collectShortageItemIds(bundles)).toEqual(["I-1", "I-2"]);
    expect(collectShortageItemIds(bundles, new Set())).toEqual(["I-1", "I-2"]);
  });

  it("선택 있음 → 선택된 부족 라인만", () => {
    const bundles = [
      makeBundle({
        lines: [
          makeLine({ line_id: "A", item_id: "I-1", shortage: 5 }),
          makeLine({ line_id: "B", item_id: "I-2", shortage: 2 }),
        ],
      }),
    ];
    expect(collectShortageItemIds(bundles, new Set(["B"]))).toEqual(["I-2"]);
  });

  it("선택에 부족 아닌 라인 섞여도 부족 라인만", () => {
    const bundles = [
      makeBundle({
        lines: [
          makeLine({ line_id: "A", item_id: "I-1", shortage: 5 }),
          makeLine({ line_id: "B", item_id: "I-2", shortage: 0 }), // 부족 아님
        ],
      }),
    ];
    expect(collectShortageItemIds(bundles, new Set(["A", "B"]))).toEqual(["I-1"]);
  });

  it("같은 item_id 는 dedupe", () => {
    const bundles = [
      makeBundle({
        bundle_id: "b1",
        lines: [makeLine({ line_id: "A", item_id: "I-1", shortage: 5 })],
      }),
      makeBundle({
        bundle_id: "b2",
        lines: [makeLine({ line_id: "B", item_id: "I-1", shortage: 3 })], // 같은 품목
      }),
    ];
    expect(collectShortageItemIds(bundles)).toEqual(["I-1"]);
  });

  it("부족 라인 없음 → 빈 배열", () => {
    const bundles = [makeBundle({ lines: [makeLine({ shortage: 0 })] })];
    expect(collectShortageItemIds(bundles)).toEqual([]);
  });
});
