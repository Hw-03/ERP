/**
 * C1 패리티 골든 테스트 — historyShared.ts 공개 함수의 현재 출력을 스냅샷으로 고정.
 * 이후 모든 증분(C2–C6)에서 이 테스트가 100% 그린이어야 동작 보존 증명.
 * 소스 변경 없이 현재 출력값을 expect 에 하드코딩.
 */
import { describe, it, expect } from "vitest";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import {
  getHistoryDisplayLabel,
  getHistoryDisplaySubLabel,
  getHistoryOperationLabel,
  getHistoryFlowLabel,
  describeBatchFlow,
  getBatchFlowEndpoints,
  getHistoryLineSignedQuantity,
  getHistoryMovementSummary,
  getHistoryBomParentLine,
  getHistoryLineStatusLabel,
} from "../historyBatchInterpreter";
import {
  classifyHistoryScope,
  getDefaultHistoryScopeForOperator,
  isExceptionLike,
  isAdjustmentLike,
  isReworkOperation,
} from "../transactionTaxonomy";
import {
  getPeriodStart,
  dateFilterToFrom,
} from "../historyQuery";
import { rowTint } from "../historyTheme";
import { parseUtc, formatHistoryDate, formatHistoryDateTimeLong, toDateKey } from "../historyFormat";

// ──────────────────────────────────────────────────────────────────
// 공통 픽스처 빌더
// ──────────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "l1",
    item_id: "ITEM-001",
    item_name: "테스트 부품",
    item_code: null,
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
    quantity: 10,
    expanded_level: 0,
    lines: [],
    ...overrides,
  };
}

function makeBatch(overrides: Partial<IoBatch> & { bundles?: IoBundle[] } = {}): IoBatch {
  return {
    batch_id: "batch-001",
    work_type: "receive",
    sub_type: "receive_supplier",
    status: "completed",
    requester_employee_id: "emp-1",
    requester_name: "홍길동",
    requester_department: "조립",
    from_department: null,
    to_department: null,
    requires_approval: false,
    stock_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-05-15T10:00:00",
    updated_at: "2026-05-15T10:00:00",
    submitted_at: null,
    completed_at: null,
    bundles: [],
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// getHistoryDisplayLabel
// ──────────────────────────────────────────────────────────────────
describe("getHistoryDisplayLabel", () => {
  it("batch 없음 + RECEIVE → 원자재 입고", () => {
    expect(getHistoryDisplayLabel({ transaction_type: "RECEIVE" })).toBe("원자재 입고");
  });

  it("batch sub_type=produce → 생산 등록", () => {
    const batch = makeBatch({ sub_type: "produce" });
    expect(getHistoryDisplayLabel({ transaction_type: "PRODUCE" }, batch)).toBe("생산 등록");
  });

  it("batch sub_type=disassemble → 재작업", () => {
    const batch = makeBatch({ sub_type: "disassemble" });
    expect(getHistoryDisplayLabel({ transaction_type: "DISASSEMBLE" }, batch)).toBe("재작업");
  });

  it("batch sub_type=warehouse_to_dept → 창고 반출", () => {
    const batch = makeBatch({ sub_type: "warehouse_to_dept" });
    expect(getHistoryDisplayLabel({ transaction_type: "TRANSFER_TO_PROD" }, batch)).toBe("창고 반출");
  });

  it("batch sub_type=receive_supplier → 원자재 입고", () => {
    const batch = makeBatch({ sub_type: "receive_supplier" });
    expect(getHistoryDisplayLabel({ transaction_type: "RECEIVE" }, batch)).toBe("원자재 입고");
  });

  it("알 수 없는 tx → transaction_type 그대로", () => {
    expect(getHistoryDisplayLabel({ transaction_type: "UNKNOWN_TX" })).toBe("UNKNOWN_TX");
  });
});

// ──────────────────────────────────────────────────────────────────
// getHistoryDisplaySubLabel
// ──────────────────────────────────────────────────────────────────
describe("getHistoryDisplaySubLabel", () => {
  it("RECEIVE (no batch) → '창고로 들어옴'", () => {
    expect(getHistoryDisplaySubLabel({ transaction_type: "RECEIVE" })).toBe("창고로 들어옴");
  });

  it("sub_type=produce → '부품 차감 + 완제품 입고'", () => {
    const batch = makeBatch({ sub_type: "produce", bundles: [] });
    expect(getHistoryDisplaySubLabel({ transaction_type: "PRODUCE" }, batch)).toBe("부품 차감 + 완제품 입고");
  });

  it("sub_type=disassemble 의미문구 없음 → batch endpoints 기반", () => {
    // disassemble 은 _DISPLAY_SUB_LABEL 에 없으므로 endpoint 로 가거나 undefined
    const line = makeLine({ from_bucket: "production", to_bucket: "none", from_department: "조립" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "disassemble", bundles: [bundle] });
    // endpoint: from=부서("조립"), to=_labelNoneBucket("disassemble","to")="재작업" → "조립 → 재작업"
    const result = getHistoryDisplaySubLabel({ transaction_type: "DISASSEMBLE" }, batch);
    expect(result).toBe("조립 → 재작업");
  });

  it("sub_type=adjust_in → '재고 수량 직접 수정'", () => {
    const batch = makeBatch({ sub_type: "adjust_in", bundles: [] });
    expect(getHistoryDisplaySubLabel({ transaction_type: "ADJUST" }, batch)).toBe("재고 수량 직접 수정");
  });

  it("ADJUST (no batch) → '재고 수량 직접 수정'", () => {
    expect(getHistoryDisplaySubLabel({ transaction_type: "ADJUST" })).toBe("재고 수량 직접 수정");
  });

  it("SHIP (no batch) → '회사 밖으로 나감'", () => {
    expect(getHistoryDisplaySubLabel({ transaction_type: "SHIP" })).toBe("회사 밖으로 나감");
  });

  it("BACKFLUSH (no batch) → 'BOM 기준 부품 차감'", () => {
    expect(getHistoryDisplaySubLabel({ transaction_type: "BACKFLUSH" })).toBe("BOM 기준 부품 차감");
  });

  it("batch 없음, tx 매핑 없으면 undefined", () => {
    expect(getHistoryDisplaySubLabel({ transaction_type: "UNKNOWN" })).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// getHistoryOperationLabel
// ──────────────────────────────────────────────────────────────────
describe("getHistoryOperationLabel", () => {
  it("sub_type 없음 + SHIP → '출고'", () => {
    expect(getHistoryOperationLabel({ transaction_type: "SHIP" })).toBe("출고");
  });

  it("sub_type=dept_transfer → '부서 이동'", () => {
    const batch = makeBatch({ sub_type: "dept_transfer" });
    expect(getHistoryOperationLabel({ transaction_type: "TRANSFER_DEPT" }, batch)).toBe("부서 이동");
  });

  it("sub_type=defect_quarantine → '새 격리'", () => {
    const batch = makeBatch({ sub_type: "defect_quarantine" });
    expect(getHistoryOperationLabel({ transaction_type: "MARK_DEFECTIVE" }, batch)).toBe("새 격리");
  });

  it("모든 tx 타입 매핑 확인", () => {
    const cases: [string, string][] = [
      ["RECEIVE", "원자재 입고"],
      ["SHIP", "출고"],
      ["TRANSFER_TO_PROD", "창고 반출"],
      ["TRANSFER_TO_WH", "창고 반입"],
      ["TRANSFER_DEPT", "부서 이동"],
      ["BACKFLUSH", "자동 차감"],
      ["PRODUCE", "생산 등록"],
      ["DISASSEMBLE", "재작업"],
      ["ADJUST", "수량 조정"],
      ["MARK_DEFECTIVE", "새 격리"],
      ["UNMARK_DEFECTIVE", "격리 해제"],
      ["DEFECT_SCRAP", "폐기"],
      ["SUPPLIER_RETURN", "원자재 반품"],
    ];
    for (const [tx, expected] of cases) {
      expect(getHistoryOperationLabel({ transaction_type: tx })).toBe(expected);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// getHistoryFlowLabel
// ──────────────────────────────────────────────────────────────────
describe("getHistoryFlowLabel", () => {
  it("batch 없음 — 모든 tx 타입 fallback", () => {
    const cases: [string, string][] = [
      ["RECEIVE", "공급사 → 창고"],
      ["SHIP", "창고 → 외부"],
      ["TRANSFER_TO_PROD", "창고 → 부서"],
      ["TRANSFER_TO_WH", "부서 → 창고"],
      ["TRANSFER_DEPT", "부서 ↔ 부서"],
      ["BACKFLUSH", "자동차감"],
      ["PRODUCE", "생산 입고"],
      ["DISASSEMBLE", "재작업"],
      ["MARK_DEFECTIVE", "새 격리"],
      ["UNMARK_DEFECTIVE", "격리 해제"],
      ["DEFECT_SCRAP", "폐기"],
      ["ADJUST", "수량 조정"],
      ["SUPPLIER_RETURN", "원자재 반품"],
    ];
    for (const [tx, expected] of cases) {
      expect(getHistoryFlowLabel({ transaction_type: tx })).toBe(expected);
    }
  });

  it("batch 있고 단일 명확한 endpoint → 흐름 라벨", () => {
    const line = makeLine({ from_bucket: "none", to_bucket: "warehouse" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "receive_supplier", bundles: [bundle] });
    // from=none→receive_supplier→"외부", to=warehouse→"창고"
    expect(getHistoryFlowLabel({ transaction_type: "RECEIVE" }, batch)).toBe("외부 → 창고");
  });

  it("batch 있으나 라인 0건 + batch.from/to_department 문자열 fallback", () => {
    const batch = makeBatch({ from_department: "조립", to_department: "고압", bundles: [] });
    expect(getHistoryFlowLabel({ transaction_type: "TRANSFER_DEPT" }, batch)).toBe("조립 → 고압");
  });

  it("unknown tx (no batch) → tx 그대로", () => {
    expect(getHistoryFlowLabel({ transaction_type: "UNKNOWN" })).toBe("UNKNOWN");
  });
});

// ──────────────────────────────────────────────────────────────────
// getBatchFlowEndpoints
// ──────────────────────────────────────────────────────────────────
describe("getBatchFlowEndpoints", () => {
  it("receive_supplier: none→warehouse → 외부→창고, mixed=false", () => {
    const line = makeLine({ from_bucket: "none", to_bucket: "warehouse" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "receive_supplier", bundles: [bundle] });
    const result = getBatchFlowEndpoints(batch);
    expect(result).toEqual({ from: "외부", to: "창고", mixed: false });
  });

  it("warehouse_to_dept: warehouse→production(조립) → 창고→조립, mixed=false", () => {
    const line = makeLine({ from_bucket: "warehouse", to_bucket: "production", to_department: "조립" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "warehouse_to_dept", bundles: [bundle] });
    const result = getBatchFlowEndpoints(batch);
    expect(result).toEqual({ from: "창고", to: "조립", mixed: false });
  });

  it("mixed endpoints (여러 from_bucket) → mixed=true + '여러 위치'", () => {
    const line1 = makeLine({ line_id: "l1", from_bucket: "warehouse", to_bucket: "production", to_department: "조립" });
    const line2 = makeLine({ line_id: "l2", from_bucket: "production", to_bucket: "production", from_department: "고압", to_department: "조립" });
    const bundle = makeBundle({ lines: [line1, line2] });
    const batch = makeBatch({ sub_type: "dept_transfer", bundles: [bundle] });
    const result = getBatchFlowEndpoints(batch);
    expect(result?.mixed).toBe(true);
    expect(result?.from).toBe("여러 위치");
  });

  it("라인 0건 + from/to_department 있음 → fallback", () => {
    const batch = makeBatch({ from_department: "조립", to_department: "고압", bundles: [] });
    expect(getBatchFlowEndpoints(batch)).toEqual({ from: "조립", to: "고압", mixed: false });
  });

  it("라인 0건 + from/to_department 없음 → null", () => {
    const batch = makeBatch({ from_department: null, to_department: null, bundles: [] });
    expect(getBatchFlowEndpoints(batch)).toBeNull();
  });

  it("disassemble: production→none → from=부서, to='재작업'", () => {
    const line = makeLine({ from_bucket: "production", from_department: "조립", to_bucket: "none" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "disassemble", bundles: [bundle] });
    const result = getBatchFlowEndpoints(batch);
    expect(result).toEqual({ from: "조립", to: "재작업", mixed: false });
  });
});

// ──────────────────────────────────────────────────────────────────
// describeBatchFlow
// ──────────────────────────────────────────────────────────────────
describe("describeBatchFlow", () => {
  it("batch 없음 → primary만", () => {
    const result = describeBatchFlow({ transaction_type: "RECEIVE" });
    expect(result.primary).toBe("원자재 입고");
    expect(result.secondary).toBeUndefined();
  });

  it("receive_supplier batch → primary=원자재 입고, secondary=창고로 들어옴", () => {
    const batch = makeBatch({ sub_type: "receive_supplier", bundles: [] });
    const result = describeBatchFlow({ transaction_type: "RECEIVE" }, batch);
    expect(result.primary).toBe("원자재 입고");
    expect(result.secondary).toBe("창고로 들어옴");
  });

  it("produce batch → primary=생산 등록, secondary=부품 차감 + 완제품 입고", () => {
    const batch = makeBatch({ sub_type: "produce", bundles: [] });
    const result = describeBatchFlow({ transaction_type: "PRODUCE" }, batch);
    expect(result.primary).toBe("생산 등록");
    expect(result.secondary).toBe("부품 차감 + 완제품 입고");
  });

  it("mixed 끝점 → secondary에 from→to 요약", () => {
    const line1 = makeLine({ line_id: "l1", from_bucket: "warehouse", to_bucket: "production", to_department: "조립" });
    const line2 = makeLine({ line_id: "l2", from_bucket: "production", from_department: "고압", to_bucket: "production", to_department: "조립" });
    const bundle = makeBundle({ lines: [line1, line2] });
    // adjust_in/out 은 _DISPLAY_SUB_LABEL 에 있으므로 sub_type 없는 case 로 테스트
    const batch = makeBatch({ sub_type: "dept_transfer", bundles: [bundle] });
    const result = describeBatchFlow({ transaction_type: "TRANSFER_DEPT" }, batch);
    // dept_transfer 는 _DISPLAY_SUB_LABEL 에 없고 mixed → secondary 에 끝점 요약
    expect(result.secondary).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// getHistoryLineSignedQuantity
// ──────────────────────────────────────────────────────────────────
describe("getHistoryLineSignedQuantity", () => {
  const baseLine = { included: true, origin: "direct" as const, direction: "in" as const, quantity: 10, unit: "EA" };

  it("sub_type=produce, bom_parent+direct → +10 EA (increase)", () => {
    const batch = makeBatch({ sub_type: "produce" });
    const bundle = makeBundle({ source_kind: "bom_parent" });
    const result = getHistoryLineSignedQuantity(baseLine, batch, bundle);
    expect(result.sign).toBe("+");
    expect(result.label).toBe("+10 EA");
    expect(result.tone).toBe("increase");
    expect(result.isApplied).toBe(true);
  });

  it("sub_type=produce, bom_parent+bom_auto → -10 EA (decrease, BOM 자식)", () => {
    const batch = makeBatch({ sub_type: "produce" });
    const bundle = makeBundle({ source_kind: "bom_parent" });
    const childLine = { ...baseLine, origin: "bom_auto" as const };
    const result = getHistoryLineSignedQuantity(childLine, batch, bundle);
    expect(result.sign).toBe("-");
    expect(result.label).toBe("-10 EA");
    expect(result.tone).toBe("decrease");
  });

  it("sub_type=disassemble, bom_parent+direct → -10 EA (재작업: 부모 감소)", () => {
    const batch = makeBatch({ sub_type: "disassemble" });
    const bundle = makeBundle({ source_kind: "bom_parent" });
    const result = getHistoryLineSignedQuantity(baseLine, batch, bundle);
    expect(result.sign).toBe("-");
    expect(result.tone).toBe("decrease");
  });

  it("sub_type=disassemble, bom_parent+bom_auto → +10 EA (재작업: 자식 증가)", () => {
    const batch = makeBatch({ sub_type: "disassemble" });
    const bundle = makeBundle({ source_kind: "bom_parent" });
    const childLine = { ...baseLine, origin: "bom_auto" as const };
    const result = getHistoryLineSignedQuantity(childLine, batch, bundle);
    expect(result.sign).toBe("+");
    expect(result.tone).toBe("increase");
  });

  it("sub_type=warehouse_to_dept → '10 EA' (plain, 위치 이동이라 +/- 없음)", () => {
    const batch = makeBatch({ sub_type: "warehouse_to_dept" });
    const result = getHistoryLineSignedQuantity(baseLine, batch);
    expect(result.sign).toBe("");
    expect(result.label).toBe("10 EA");
    expect(result.tone).toBe("muted");
  });

  it("sub_type=dept_to_warehouse → '10 EA' (plain, 위치 이동이라 +/- 없음)", () => {
    const batch = makeBatch({ sub_type: "dept_to_warehouse" });
    const result = getHistoryLineSignedQuantity(baseLine, batch);
    expect(result.sign).toBe("");
    expect(result.label).toBe("10 EA");
    expect(result.tone).toBe("muted");
  });

  it("sub_type=dept_transfer → 이동 10 EA (move)", () => {
    const batch = makeBatch({ sub_type: "dept_transfer" });
    const result = getHistoryLineSignedQuantity(baseLine, batch);
    expect(result.sign).toBe("");
    expect(result.label).toBe("이동 10 EA");
    expect(result.tone).toBe("move");
  });

  it("sub_type=adjust_in → + (increase)", () => {
    const batch = makeBatch({ sub_type: "adjust_in" });
    const result = getHistoryLineSignedQuantity(baseLine, batch);
    expect(result.sign).toBe("+");
    expect(result.tone).toBe("increase");
  });

  it("sub_type=adjust_out → - (decrease)", () => {
    const batch = makeBatch({ sub_type: "adjust_out" });
    const result = getHistoryLineSignedQuantity(baseLine, batch);
    expect(result.sign).toBe("-");
    expect(result.tone).toBe("decrease");
  });

  it("sub_type=receive_supplier → + (increase)", () => {
    const batch = makeBatch({ sub_type: "receive_supplier" });
    const result = getHistoryLineSignedQuantity(baseLine, batch);
    expect(result.sign).toBe("+");
  });

  it("sub_type=supplier_return → - (decrease)", () => {
    const batch = makeBatch({ sub_type: "supplier_return" });
    const result = getHistoryLineSignedQuantity(baseLine, batch);
    expect(result.sign).toBe("-");
  });

  it("sub_type=defect_quarantine → - (decrease)", () => {
    const batch = makeBatch({ sub_type: "defect_quarantine" });
    const result = getHistoryLineSignedQuantity(baseLine, batch);
    expect(result.sign).toBe("-");
  });

  it("batch 없음, direction=out → -", () => {
    const outLine = { ...baseLine, direction: "out" as const };
    const result = getHistoryLineSignedQuantity(outLine);
    expect(result.sign).toBe("-");
  });

  it("batch 없음, direction=move → 이동", () => {
    const moveLine = { ...baseLine, direction: "move" as const };
    const result = getHistoryLineSignedQuantity(moveLine);
    expect(result.sign).toBe("");
    expect(result.tone).toBe("move");
  });

  it("batch 없음, direction=adjust + qty>=0 → +", () => {
    const adjLine = { ...baseLine, direction: "adjust" as const, quantity: 5 };
    const result = getHistoryLineSignedQuantity(adjLine);
    expect(result.sign).toBe("+");
  });

  it("batch 없음, direction=adjust + qty<0 → -", () => {
    const adjLine = { ...baseLine, direction: "adjust" as const, quantity: -5 };
    const result = getHistoryLineSignedQuantity(adjLine);
    expect(result.sign).toBe("-");
  });

  it("included=false → tone=muted", () => {
    const excLine = { ...baseLine, included: false };
    const batch = makeBatch({ sub_type: "receive_supplier" });
    const result = getHistoryLineSignedQuantity(excLine, batch);
    expect(result.tone).toBe("muted");
    expect(result.isApplied).toBe(false);
  });

  it("단위 없음 → 단위 생략", () => {
    const noUnit = { ...baseLine, unit: null };
    const batch = makeBatch({ sub_type: "receive_supplier" });
    const result = getHistoryLineSignedQuantity(noUnit, batch);
    expect(result.label).toBe("+10");
  });

  it("수량이 string으로 올 때도 처리", () => {
    const strQty = { ...baseLine, quantity: "15" as unknown as number };
    const batch = makeBatch({ sub_type: "receive_supplier" });
    const result = getHistoryLineSignedQuantity(strQty, batch);
    expect(result.label).toBe("+15 EA");
  });
});

// ──────────────────────────────────────────────────────────────────
// getHistoryMovementSummary
// ──────────────────────────────────────────────────────────────────
describe("getHistoryMovementSummary", () => {
  it("batch 없음 → '하위 N건' fallback", () => {
    const result = getHistoryMovementSummary({ transaction_type: "RECEIVE" }, null, 5);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].label).toBe("하위 5건");
    expect(result.parts[0].tone).toBe("muted");
  });

  it("receive_supplier → '입고 N품목 · Q 단위'", () => {
    const line = makeLine({ quantity: 20, unit: "EA" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "receive_supplier", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "RECEIVE" }, batch);
    expect(result.parts[0].label).toContain("입고");
    expect(result.parts[0].tone).toBe("success");
  });

  it("produce → 상위/하위 파트 분리", () => {
    const parentLine = makeLine({ origin: "direct", quantity: 5, unit: "EA" });
    const childLine = makeLine({ line_id: "l2", item_id: "ITEM-002", origin: "bom_auto", quantity: 10, unit: "EA" });
    const bundle = makeBundle({ source_kind: "bom_parent", lines: [parentLine, childLine] });
    const batch = makeBatch({ sub_type: "produce", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "PRODUCE" }, batch);
    const labels = result.parts.map((p) => p.label);
    expect(labels.some((l) => l.includes("상위"))).toBe(true);
    expect(labels.some((l) => l.includes("하위"))).toBe(true);
    // produce: 상위=primary, 하위=danger
    expect(result.parts.find((p) => p.label.includes("상위"))?.tone).toBe("primary");
    expect(result.parts.find((p) => p.label.includes("하위"))?.tone).toBe("danger");
  });

  it("disassemble → 상위=danger, 하위=primary", () => {
    const parentLine = makeLine({ origin: "direct", quantity: 5, unit: "EA" });
    const childLine = makeLine({ line_id: "l2", item_id: "ITEM-002", origin: "bom_auto", quantity: 10, unit: "EA" });
    const bundle = makeBundle({ source_kind: "bom_parent", lines: [parentLine, childLine] });
    const batch = makeBatch({ sub_type: "disassemble", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "DISASSEMBLE" }, batch);
    expect(result.parts.find((p) => p.label.includes("상위"))?.tone).toBe("danger");
    expect(result.parts.find((p) => p.label.includes("하위"))?.tone).toBe("primary");
  });

  it("warehouse_to_dept → '이동 N품목'", () => {
    const line = makeLine({ quantity: 3, unit: "EA" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "warehouse_to_dept", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "TRANSFER_TO_PROD" }, batch);
    expect(result.parts[0].label).toContain("이동");
    expect(result.parts[0].tone).toBe("info");
  });

  it("SHIP (batch 없음) → 하위 N건 fallback", () => {
    // tx=SHIP 에 대응하는 IoBatch sub_type 값이 enum 에 없으므로
    // batch 없는 케이스로 골든 고정 (batch 있으면 sub_type 분기가 먼저 처리됨).
    const result = getHistoryMovementSummary({ transaction_type: "SHIP" }, null, 3);
    expect(result.parts[0].label).toBe("하위 3건");
    expect(result.parts[0].tone).toBe("muted");
  });

  it("supplier_return → '반품 N품목' danger", () => {
    const line = makeLine();
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "supplier_return", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "SUPPLIER_RETURN" }, batch);
    expect(result.parts[0].label).toContain("반품");
    expect(result.parts[0].tone).toBe("danger");
  });

  it("defect_quarantine → '불량 N품목' danger", () => {
    const line = makeLine();
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "defect_quarantine", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "MARK_DEFECTIVE" }, batch);
    expect(result.parts[0].label).toContain("불량");
    expect(result.parts[0].tone).toBe("danger");
  });

  it("adjust_in + positive qty → '증가 N' success", () => {
    const line = makeLine({ quantity: 5 });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "adjust_in", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "ADJUST" }, batch);
    expect(result.parts.some((p) => p.label.includes("증가"))).toBe(true);
  });

  it("adjust_out + negative qty → '감소 N' danger", () => {
    const line = makeLine({ quantity: -5 });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "adjust_out", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "ADJUST" }, batch);
    expect(result.parts.some((p) => p.label.includes("감소"))).toBe(true);
    expect(result.parts.find((p) => p.label.includes("감소"))?.tone).toBe("danger");
  });

  it("부족 라인 있으면 warning 포함", () => {
    const line = makeLine({ shortage: 3 });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ sub_type: "receive_supplier", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "RECEIVE" }, batch);
    expect(result.warning).toBe("부족 1");
  });

  it("단위 혼합 → 합 없이 품목 수만", () => {
    const line1 = makeLine({ line_id: "l1", item_id: "ITEM-001", unit: "EA", quantity: 5 });
    const line2 = makeLine({ line_id: "l2", item_id: "ITEM-002", unit: "KG", quantity: 3 });
    const bundle = makeBundle({ lines: [line1, line2] });
    const batch = makeBatch({ sub_type: "receive_supplier", bundles: [bundle] });
    const result = getHistoryMovementSummary({ transaction_type: "RECEIVE" }, batch);
    // 단위 혼합: 합 없이 "입고 2품목" 형식
    expect(result.parts[0].label).toMatch(/입고\s+2품목/);
    expect(result.parts[0].label).not.toContain("EA");
  });
});

// ──────────────────────────────────────────────────────────────────
// getHistoryBomParentLine
// ──────────────────────────────────────────────────────────────────
describe("getHistoryBomParentLine", () => {
  it("source_kind=bom_parent + origin=direct → 부모 라인 반환", () => {
    const parent = makeLine({ origin: "direct" });
    const child = makeLine({ line_id: "l2", origin: "bom_auto" });
    const bundle = makeBundle({ source_kind: "bom_parent", lines: [parent, child] });
    expect(getHistoryBomParentLine(bundle)).toBe(parent);
  });

  it("source_kind=direct_item → null", () => {
    const line = makeLine({ origin: "direct" });
    const bundle = makeBundle({ source_kind: "direct_item", lines: [line] });
    expect(getHistoryBomParentLine(bundle)).toBeNull();
  });

  it("source_kind=bom_parent 이지만 origin=direct 없음 → null", () => {
    const child = makeLine({ origin: "bom_auto" });
    const bundle = makeBundle({ source_kind: "bom_parent", lines: [child] });
    expect(getHistoryBomParentLine(bundle)).toBeNull();
  });

  it("null/undefined bundle → null", () => {
    expect(getHistoryBomParentLine(null)).toBeNull();
    expect(getHistoryBomParentLine(undefined)).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// getHistoryLineStatusLabel
// ──────────────────────────────────────────────────────────────────
describe("getHistoryLineStatusLabel", () => {
  it("included=true, shortage=0 → '포함' ok", () => {
    expect(getHistoryLineStatusLabel({ included: true, shortage: 0 })).toEqual({ label: "포함", tone: "ok" });
  });

  it("included=false → '제외' muted", () => {
    expect(getHistoryLineStatusLabel({ included: false })).toEqual({ label: "제외", tone: "muted" });
  });

  it("included=true, shortage=3 → '부족 3' danger", () => {
    expect(getHistoryLineStatusLabel({ included: true, shortage: 3 })).toEqual({ label: "부족 3", tone: "danger" });
  });

  it("shortage=null → 포함으로 처리", () => {
    expect(getHistoryLineStatusLabel({ included: true, shortage: null })).toEqual({ label: "포함", tone: "ok" });
  });
});

// ──────────────────────────────────────────────────────────────────
// classifyHistoryScope
// ──────────────────────────────────────────────────────────────────
describe("classifyHistoryScope", () => {
  it("RECEIVE (no batch) → warehouse_involved", () => {
    expect(classifyHistoryScope({ transaction_type: "RECEIVE" })).toBe("warehouse_involved");
  });

  it("PRODUCE (no batch) → department_internal", () => {
    expect(classifyHistoryScope({ transaction_type: "PRODUCE" })).toBe("department_internal");
  });

  it("ADJUST (no batch) → ambiguous", () => {
    expect(classifyHistoryScope({ transaction_type: "ADJUST" })).toBe("ambiguous");
  });

  it("batch 있고 warehouse bucket → warehouse_involved", () => {
    const line = makeLine({ from_bucket: "none", to_bucket: "warehouse" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ bundles: [bundle] });
    expect(classifyHistoryScope({ transaction_type: "ADJUST" }, batch)).toBe("warehouse_involved");
  });

  it("batch 있고 모두 production → department_internal", () => {
    const line = makeLine({ from_bucket: "production", to_bucket: "production" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ bundles: [bundle] });
    expect(classifyHistoryScope({ transaction_type: "ADJUST" }, batch)).toBe("department_internal");
  });

  it("batch 있고 production+defective → ambiguous", () => {
    const line = makeLine({ from_bucket: "production", to_bucket: "defective" });
    const bundle = makeBundle({ lines: [line] });
    const batch = makeBatch({ bundles: [bundle] });
    expect(classifyHistoryScope({ transaction_type: "MARK_DEFECTIVE" }, batch)).toBe("ambiguous");
  });
});

// ──────────────────────────────────────────────────────────────────
// getDefaultHistoryScopeForOperator
// ──────────────────────────────────────────────────────────────────
describe("getDefaultHistoryScopeForOperator", () => {
  it("warehouse_role=primary → WAREHOUSE_INVOLVED", () => {
    expect(getDefaultHistoryScopeForOperator({ warehouse_role: "primary" })).toBe("WAREHOUSE_INVOLVED");
  });

  it("warehouse_role=deputy → WAREHOUSE_INVOLVED", () => {
    expect(getDefaultHistoryScopeForOperator({ warehouse_role: "deputy" })).toBe("WAREHOUSE_INVOLVED");
  });

  it("warehouse_role=none → DEPT_INTERNAL", () => {
    expect(getDefaultHistoryScopeForOperator({ warehouse_role: "none" })).toBe("DEPT_INTERNAL");
  });

  it("warehouse_role=null → DEPT_INTERNAL", () => {
    expect(getDefaultHistoryScopeForOperator({ warehouse_role: null })).toBe("DEPT_INTERNAL");
  });

  it("operator=null → DEPT_INTERNAL", () => {
    expect(getDefaultHistoryScopeForOperator(null)).toBe("DEPT_INTERNAL");
  });

  it("대소문자 무관 (PRIMARY) → WAREHOUSE_INVOLVED", () => {
    expect(getDefaultHistoryScopeForOperator({ warehouse_role: "PRIMARY" })).toBe("WAREHOUSE_INVOLVED");
  });
});

// ──────────────────────────────────────────────────────────────────
// isExceptionLike
// ──────────────────────────────────────────────────────────────────
describe("isExceptionLike", () => {
  it("ADJUST → true", () => {
    expect(isExceptionLike({ transaction_type: "ADJUST" })).toBe(true);
  });

  it("MARK_DEFECTIVE → true", () => {
    expect(isExceptionLike({ transaction_type: "MARK_DEFECTIVE" })).toBe(true);
  });

  it("PRODUCE (edit_count=0) → false", () => {
    expect(isExceptionLike({ transaction_type: "PRODUCE", edit_count: 0 })).toBe(false);
  });

  it("PRODUCE (edit_count=1) → true", () => {
    expect(isExceptionLike({ transaction_type: "PRODUCE", edit_count: 1 })).toBe(true);
  });

  it("PRODUCE (edit_count=null) → false", () => {
    expect(isExceptionLike({ transaction_type: "PRODUCE", edit_count: null })).toBe(false);
  });

  it("SUPPLIER_RETURN → true", () => {
    expect(isExceptionLike({ transaction_type: "SUPPLIER_RETURN" })).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// isAdjustmentLike
// ──────────────────────────────────────────────────────────────────
describe("isAdjustmentLike", () => {
  it("ADJUST → true", () => {
    expect(isAdjustmentLike({ transaction_type: "ADJUST" })).toBe(true);
  });

  it("MARK_DEFECTIVE → false", () => {
    expect(isAdjustmentLike({ transaction_type: "MARK_DEFECTIVE" })).toBe(false);
  });

  it("SUPPLIER_RETURN → false", () => {
    expect(isAdjustmentLike({ transaction_type: "SUPPLIER_RETURN" })).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// isReworkOperation
// ──────────────────────────────────────────────────────────────────
describe("isReworkOperation", () => {
  it("tx=DISASSEMBLE (no batch) → true", () => {
    expect(isReworkOperation({ transaction_type: "DISASSEMBLE" })).toBe(true);
  });

  it("batch.sub_type=disassemble → true", () => {
    expect(isReworkOperation({ transaction_type: "PRODUCE" }, { sub_type: "disassemble" })).toBe(true);
  });

  it("tx=PRODUCE, no batch → false", () => {
    expect(isReworkOperation({ transaction_type: "PRODUCE" })).toBe(false);
  });

  it("tx=PRODUCE, batch.sub_type=produce → false", () => {
    expect(isReworkOperation({ transaction_type: "PRODUCE" }, { sub_type: "produce" })).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// rowTint
// ──────────────────────────────────────────────────────────────────
describe("rowTint", () => {
  it("RECEIVE → 초록 tint", () => {
    expect(rowTint("RECEIVE")).toBe("rgba(67,211,157,.05)");
  });

  it("PRODUCE → 초록 tint", () => {
    expect(rowTint("PRODUCE")).toBe("rgba(67,211,157,.05)");
  });

  it("SHIP → 빨강 tint", () => {
    expect(rowTint("SHIP")).toBe("rgba(255,123,123,.05)");
  });

  it("BACKFLUSH → 빨강 tint", () => {
    expect(rowTint("BACKFLUSH")).toBe("rgba(255,123,123,.05)");
  });

  it("ADJUST → 파랑 tint", () => {
    expect(rowTint("ADJUST")).toBe("rgba(101,169,255,.05)");
  });

  it("TRANSFER_TO_PROD → 하늘 tint", () => {
    expect(rowTint("TRANSFER_TO_PROD")).toBe("rgba(78,201,245,.05)");
  });

  it("TRANSFER_TO_WH → 하늘 tint", () => {
    expect(rowTint("TRANSFER_TO_WH")).toBe("rgba(78,201,245,.05)");
  });

  it("TRANSFER_DEPT → 하늘 tint", () => {
    expect(rowTint("TRANSFER_DEPT")).toBe("rgba(78,201,245,.05)");
  });

  it("알 수 없는 타입 → transparent", () => {
    expect(rowTint("UNKNOWN")).toBe("transparent");
  });
});

// ──────────────────────────────────────────────────────────────────
// parseUtc
// ──────────────────────────────────────────────────────────────────
describe("parseUtc", () => {
  it("Z 포함 → 그대로 파싱", () => {
    const d = parseUtc("2026-05-15T10:00:00Z");
    expect(d.getTime()).toBe(new Date("2026-05-15T10:00:00Z").getTime());
  });

  it("Z 없음 → Z 추가하여 파싱", () => {
    const d = parseUtc("2026-05-15T10:00:00");
    expect(d.getTime()).toBe(new Date("2026-05-15T10:00:00Z").getTime());
  });

  it("오프셋 포함 → 그대로 파싱", () => {
    const d = parseUtc("2026-05-15T10:00:00+09:00");
    expect(d.getTime()).toBe(new Date("2026-05-15T10:00:00+09:00").getTime());
  });
});

// ──────────────────────────────────────────────────────────────────
// formatHistoryDate
// ──────────────────────────────────────────────────────────────────
describe("formatHistoryDate", () => {
  it("MM/DD HH:mm 형식 반환", () => {
    // UTC 2026-05-15T10:30:00Z → 로컬 시간 기준 포맷
    const result = formatHistoryDate("2026-05-15T10:30:00Z");
    // MM/DD HH:mm 형식 확인 (시간은 로컬 TZ에 따라 다름)
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});

// ──────────────────────────────────────────────────────────────────
// formatHistoryDateTimeLong
// ──────────────────────────────────────────────────────────────────
describe("formatHistoryDateTimeLong", () => {
  it("연 월 일 시 분 형식 반환", () => {
    const result = formatHistoryDateTimeLong("2026-05-15T10:30:00Z");
    expect(result).toMatch(/\d{4}년 \d+월 \d+일\s+\d{2}시 \d{2}분/);
  });
});

// ──────────────────────────────────────────────────────────────────
// toDateKey
// ──────────────────────────────────────────────────────────────────
describe("toDateKey", () => {
  it("YYYY-MM-DD 형식 반환", () => {
    const result = toDateKey("2026-05-15T10:30:00Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ──────────────────────────────────────────────────────────────────
// getPeriodStart
// ──────────────────────────────────────────────────────────────────
describe("getPeriodStart", () => {
  it("TODAY → 오늘 자정 Date", () => {
    const result = getPeriodStart("TODAY");
    const now = new Date();
    expect(result?.getFullYear()).toBe(now.getFullYear());
    expect(result?.getMonth()).toBe(now.getMonth());
    expect(result?.getDate()).toBe(now.getDate());
    expect(result?.getHours()).toBe(0);
  });

  it("WEEK → 이번 주 일요일 자정", () => {
    const result = getPeriodStart("WEEK");
    expect(result?.getDay()).toBe(0);
    expect(result?.getHours()).toBe(0);
  });

  it("MONTH → 이번 달 1일 자정", () => {
    const result = getPeriodStart("MONTH");
    const now = new Date();
    expect(result?.getDate()).toBe(1);
    expect(result?.getMonth()).toBe(now.getMonth());
  });

  it("ALL → null", () => {
    expect(getPeriodStart("ALL")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// dateFilterToFrom
// ──────────────────────────────────────────────────────────────────
describe("dateFilterToFrom", () => {
  it("TODAY → YYYY-MM-DD 형식", () => {
    const result = dateFilterToFrom("TODAY");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("WEEK → YYYY-MM-DD 형식", () => {
    const result = dateFilterToFrom("WEEK");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("MONTH → YYYY-MM-DD 형식이며 일=01", () => {
    const result = dateFilterToFrom("MONTH");
    expect(result).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("ALL → undefined", () => {
    expect(dateFilterToFrom("ALL")).toBeUndefined();
  });
});
