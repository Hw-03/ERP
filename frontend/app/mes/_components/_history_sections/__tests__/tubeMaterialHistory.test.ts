import { describe, expect, it } from "vitest";
import type { IoBatch } from "@/lib/api";
import { OPERATION_OPTIONS } from "../historyQuery";
import { getBatchFlowEndpoints, getHistoryOperationLabel } from "../historyBatchInterpreter";

describe("튜브 원자재 이력", () => {
  it("튜브 원자재 필터를 서버 operation_keys에 연결한다", () => {
    expect(OPERATION_OPTIONS).toContainEqual({ value: "tube_material", label: "튜브 원자재 입출고" });
  });
  it.each([true, false])("업체 스냅샷과 튜브 위치를 입고=%s 이력에 유지한다", (inbound) => {
    const batch = { work_type: "tube_material", sub_type: inbound ? "tube_receive_supplier" : "tube_outbound_supplier", supplier_name_snapshot: "당시 튜브 업체", bundles: [{ source_kind: "direct_item", lines: [{ included: true, direction: inbound ? "in" : "out", from_bucket: inbound ? "none" : "production", from_department: inbound ? null : "튜브", to_bucket: inbound ? "production" : "none", to_department: inbound ? "튜브" : null }] }] } as IoBatch;
    expect(getBatchFlowEndpoints(batch)).toEqual({ from: inbound ? "당시 튜브 업체" : "튜브", to: inbound ? "튜브" : "당시 튜브 업체", mixed: false });
    expect(getHistoryOperationLabel({ transaction_type: inbound ? "RECEIVE" : "MATERIAL_OUT" } as never, batch)).toBe(inbound ? "튜브 원자재 입고" : "튜브 원자재 출고");
  });
});
