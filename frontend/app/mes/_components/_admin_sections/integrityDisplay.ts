import type { InventoryIntegrityIssue, InventoryIntegrityResult } from "@/lib/api/admin";

export const INTEGRITY_CHECK_LABELS: Record<string, string> = {
  INVENTORY_TOTAL_MISMATCH: "전체 재고 합계 불일치", NEGATIVE_INVENTORY: "음수 재고",
  NEGATIVE_LOCATION: "음수 위치 재고", PENDING_RESERVATION_MISMATCH: "예약 수량 불일치",
  STOCK_REQUEST_STATE_MISMATCH: "요청과 상세 처리 상태 불일치", SHIPPING_ALLOCATION_MISMATCH: "출하 배정",
  WAREHOUSE_PHYSICAL_MISMATCH: "창고 실제 배치 수량 불일치", ORPHAN_REFERENCE: "연결된 원본 기록 없음",
  OPERATION_V2_EFFECT_INVALID: "작업의 재고 영향 근거 오류", OPERATION_V1_EFFECT_MISSING: "이전 작업의 재고 영향 근거 누락",
  DEFECT_STOCK_MISMATCH: "불량 원장·재고", PARTIAL_CANCELLATION: "부분 취소 의심",
  WORKFLOW_STATE_RESIDUE: "업무 상태 잔존", DUPLICATE_REVERSAL: "중복 역전", WEEKLY_UNCLASSIFIED_EFFECT: "주간 미분류",
};

const VALUE_LABELS: Record<string, string> = {
  stored_quantity: "현재 전체 재고", computed_quantity: "계산된 전체 재고", quantity: "수량",
  warehouse_quantity: "창고 수량", pending_quantity: "예약 수량", stored_pending: "저장된 예약 수량",
  reserved_quantity: "요청의 예약 수량", physical_quantity: "실제 수량", current_value: "현재값", expected_value: "기대값",
  expected_quantity: "기대 수량", expected_status: "기대 상태", status: "상태",
  available_quantity: "가용 수량", tracked_quantity: "배치된 수량", box_quantity: "박스 수량",
  special_zone_quantity: "특수 구역 수량", unplaced_quantity: "미배치 수량", unplaced_rows: "미배치 행",
  request_status: "요청 상태", allocation_status: "배정 상태", expected_allocation_status: "기대 배정 상태",
};

const REASON_LABELS: Record<string, string> = {
  inactive_zone_stock: "사용 중지 구역에 재고가 남아 있습니다.", invalid_inventory_effect: "재고 영향 근거가 잘못되었습니다.",
  missing_active_allocation: "업무 상태에 필요한 배정이 없습니다.", missing_angle: "연결된 위치 구역이 없습니다.",
  missing_department: "대상 부서가 없습니다.", missing_effect: "재고 영향 근거가 없습니다.",
  missing_inventory: "연결된 재고가 없습니다.", missing_item: "연결된 품목이 없습니다.",
  missing_location: "연결된 재고 위치가 없습니다.", missing_operation: "연결된 작업이 없습니다.",
  missing_or_invalid_inventory_effect: "재고 영향 근거가 없거나 잘못되었습니다.", missing_reversed_operation: "취소 대상 원작업이 없습니다.",
  negative_quantity: "수량이 음수입니다.", non_positive_quantity: "업무 수량이 0 이하입니다.",
  pending_exceeds_physical: "예약 수량이 실제 재고보다 많습니다.", reserved_exceeds_location_stock: "출하 예약이 가용 위치 재고보다 많습니다.",
  stale_reserved: "오래된 예약 요청이 처리되지 않았습니다.", tracked_exceeds_warehouse: "배치 수량이 정상 창고 재고보다 많습니다.",
};

type DisplayIssue = Omit<InventoryIntegrityIssue, "category"> & { category: string };

/** 기존 상세와 동일한 표본은 합치고, 서버가 제공한 표본만 조회용으로 표시한다. */
export function integrityDisplayIssues(result: InventoryIntegrityResult): DisplayIssue[] {
  const issues: DisplayIssue[] = [...result.issues];
  const existing = new Set(issues.map((issue) => issue.problem_id));
  for (const check of result.checks ?? []) {
    for (const sample of check.samples) {
      if (sample.problem_id && existing.has(String(sample.problem_id))) continue;
      const identity = Object.entries(sample).filter(([key]) => key.endsWith("_id") || key.endsWith("_ids") || ["scope", "department", "status", "reason"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right));
      const problemId = sample.problem_id ? String(sample.problem_id) : `${check.check_id}:${JSON.stringify(identity)}`;
      const current = Object.entries(sample).filter(([key]) => VALUE_LABELS[key] && !key.startsWith("computed_") && !key.startsWith("expected_") && key !== "reserved_quantity")
        .map(([key, value]) => `${VALUE_LABELS[key]} ${String(value)}`).join(" · ");
      const expected = Object.entries(sample).filter(([key]) => VALUE_LABELS[key] && (key.startsWith("computed_") || key.startsWith("expected_") || key === "reserved_quantity"))
        .map(([key, value]) => `${VALUE_LABELS[key]} ${String(value)}`).join(" · ");
      issues.push({ problem_id: problemId, category: check.check_id, title: INTEGRITY_CHECK_LABELS[check.check_id] ?? "재고 정합성 확인",
        description: sample.reason && REASON_LABELS[String(sample.reason)] ? REASON_LABELS[String(sample.reason)] : "저장된 업무 기록을 확인해야 합니다. 이 화면에서는 복구하지 않습니다.",
        cause_ids: identity.filter(([key]) => key.endsWith("_id") || key.endsWith("_ids")).flatMap(([, value]) => Array.isArray(value) ? value.map(String) : [String(value)]),
        current_value: current || "현재값 상세 미제공", expected_value: expected || "기대값 상세 미제공 · 수동 검토 필요", repairable: false });
    }
  }
  return issues;
}
