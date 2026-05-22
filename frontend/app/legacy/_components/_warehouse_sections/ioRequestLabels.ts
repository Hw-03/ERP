/** 입출고 요청 유형 표시 라벨 — DraftCartItemRow / WarehouseQueueRow / MyRequestRow 공용. */
export const REQUEST_TYPE_LABEL: Record<string, string> = {
  raw_receive: "원자재 입고",
  raw_ship: "원자재 출고",
  warehouse_to_dept: "창고 → 부서 이동",
  dept_to_warehouse: "부서 → 창고 복귀",
  dept_internal: "부서 내부 이동",
  mark_defective_wh: "창고 불량 등록",
  mark_defective_prod: "생산 불량 등록",
  supplier_return: "공급업체 반품",
  package_out: "패키지 출고",
  manual_adjustment: "수동 조정",
  // 불량 처리 흐름 (Phase 2/5)
  defect_scrap: "불량 폐기",
  defect_return: "불량 공급처 반품",
  defect_disassemble: "불량 분해 (BOM 자식 처리)",
};
