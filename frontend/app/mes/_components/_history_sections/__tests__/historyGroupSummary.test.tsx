import { describe, expect, it } from "vitest";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getHistoryGroupSummary } from "../historyTableHelpers";
import { getHistoryListOperationLabel } from "../historyPresentation";

function entry(id: string, type: string, role: string): TransactionLog {
  return {
    log_id: id, item_id: id, item_name: id, transaction_type: type,
    operation_role: role, operation_display_label: "defect_disassemble",
    reference_no: "defect-disassemble:73567409-c985-470c-a891-29f6229abce0",
  } as TransactionLog;
}

describe("shared history group summary", () => {
  it.each([
    ["RECEIVE", "tube_receive_supplier", "튜브 원자재 입고"],
    ["MATERIAL_OUT", "tube_outbound_supplier", "튜브 원자재 출고"],
  ])("목록 %s는 전체 batch 조회 전에도 history_batch의 튜브 작업 라벨을 사용한다", (type, subType, label) => {
    const log = { ...entry("TR 원자재", type, "PRIMARY"), reference_no: null, operation_display_label: null, history_batch: { work_type: "tube_material", sub_type: subType } };
    expect(getHistoryListOperationLabel(log)).toBe(label);
    expect(getHistoryGroupSummary({ type: "solo", log }).label).toBe(label);
    expect(getHistoryGroupSummary({ type: "operation", operationId: "tube-op", logs: [log] }).label).toBe(label);
    expect(getHistoryListOperationLabel({ ...log, operation_kind: "CANCELLATION" })).toBe(`${label} 취소`);
  });
  it("불량 재작업 회수 거래가 먼저 와도 부모와 재작업 분류를 사용한다", () => {
    const child = entry("ADX6000 관전류 BD", "RECEIVE", "REWORK_CHILD_NORMAL");
    const parent = entry("ADX6000FB BODY RIGHT ASS'Y", "DISASSEMBLE", "REWORK_PARENT_DEFECTIVE");
    const repeatedChild = { ...child, log_id: "second-effect" };
    const summary = getHistoryGroupSummary({ type: "operation", operationId: "operation", logs: [child, repeatedChild, parent] });
    expect(summary.primaryLog).toBe(parent);
    expect(summary.label).toBe("재작업");
    expect(summary.displayType).toBe("DISASSEMBLE");
    expect(summary.color).toBe(LEGACY_COLORS.red);
    expect(summary.title).toBe(parent.item_name);
    expect(summary.additionalItemCount).toBe(1);
  });

  it.each([
    ["TRANSFER_TO_PROD", "창고 입출고"], ["PRODUCE", "생산 입고"],
    ["MARK_DEFECTIVE", "불량 격리"], ["SUPPLIER_RETURN", "반품"],
    ["INTERNAL_USE", "AS 사용"],
  ])("목록 분류 %s를 공통으로 사용한다", (type, label) => {
    const log = { ...entry("item", type, "PRIMARY"), reference_no: null, department: "AS" };
    expect(getHistoryGroupSummary({ type: "solo", log }).label).toBe(label);
  });

  it("취소 작업 라벨을 유지한다", () => {
    const log = { ...entry("item", "MARK_DEFECTIVE", "PRIMARY"), reference_no: null, operation_kind: "CANCELLATION" } as TransactionLog;
    const summary = getHistoryGroupSummary({ type: "solo", log });
    expect(summary.label).toBe("불량 취소");
    expect(summary.color).toBe(LEGACY_COLORS.red);
  });

  it("배치 메타데이터 없이 거래를 원자재 입고로 추정하지 않는다", () => {
    const first = entry("child", "RECEIVE", "PRIMARY");
    const summary = getHistoryGroupSummary({ type: "op_batch", batchId: "batch", refNo: null, logs: [first] });
    expect(summary.pending).toBe(true);
    expect(summary.label).toBe("작업 정보 확인 중");
    expect(summary.color).toBe(LEGACY_COLORS.muted2);
  });
});
