/**
 * io/glossary.ts — 출입고 도메인의 화면 라벨 단일 사전.
 *
 * 같은 비즈니스 동작이 V2 입력 화면 / 내역 / 요청 큐 / history KPI 에서
 * 서로 다른 단어로 표기되어 사용자·리뷰어 모두 혼란을 겪던 문제(P0-1)를 해결한다.
 *
 * 본 모듈이 코드용 단일 소스이며, 사람용 사전은 `docs/GLOSSARY.md`.
 * 두 곳이 일치해야 한다.
 *
 * 캐노니컬 선택 원칙:
 * - 사용자가 가장 자주 보는 V2 IoComposeView 의 라벨을 우선 — 거기서 누른 버튼과
 *   같은 단어가 내역에서도 보여야 한다.
 * - 모호하면 한국어 한 단어 (예: DISASSEMBLE = "분해", 이전 "재작업" 폐기).
 * - 부호·방향·tone 은 별도 모듈 — 본 사전은 "단어"만 다룬다.
 */

import type { IoBucket, IoSubType, IoWorkType } from "@/lib/api/types/io";
import type { TransactionType } from "@/lib/api/types/shared";

// ──────────────────────────────────────────────────────────────────
// Work Type
// ──────────────────────────────────────────────────────────────────

export const WORK_TYPE_LABEL: Record<IoWorkType, string> = {
  receive: "원자재 입고",
  warehouse_io: "창고 입출고",
  process: "부서 입출고",
  defect: "불량",
  internal_use: "AS·연구 사용출고",
};

export const WORK_TYPE_DESCRIPTION: Record<IoWorkType, string> = {
  receive: "발주 품목 입고",
  warehouse_io: "창고↔부서",
  process: "부서 내 작업",
  defect: "불량 재고 격리",
  internal_use: "창고 재고를 AS·연구 용도로 반출",
};

// ──────────────────────────────────────────────────────────────────
// Sub Type (V2 작업 분기 — 모든 입력 흐름의 최소 단위)
// ──────────────────────────────────────────────────────────────────

export const SUB_TYPE_LABEL: Record<IoSubType, string> = {
  // receive_supplier 의 V2 sub-type 라벨은 work-type 라벨("원자재 입고") 과 일치시킨다.
  // receive workType 에는 sub_type 이 1개뿐이므로 사용자가 보는 메인 단어가 통일된다.
  receive_supplier: "원자재 입고",
  warehouse_to_dept: "창고 → 부서",
  dept_to_warehouse: "부서 → 창고",
  dept_transfer: "부서 → 부서",
  produce: "생산",
  disassemble: "분해",
  adjust_in: "수량보정 입고",
  adjust_out: "출고",
  defect_quarantine: "새 불량",
  defect_restore: "불량 해제",
  defect_process: "불량 처리",
  supplier_return: "원자재 반품",
  internal_use_out: "AS·연구 사용출고",
};

export const SUB_TYPE_DESCRIPTION: Record<IoSubType, string> = {
  receive_supplier: "선택 품목을 창고 재고로 증가",
  warehouse_to_dept: "BOM 1단계 하위 품목 자동 포함",
  dept_to_warehouse: "반납할 하위 품목만 체크",
  dept_transfer: "부서 간 직접 이동",
  produce: "하위 자재 출고 + 결과 품목 입고",
  disassemble: "상위 품목 출고 + 회수 품목 입고",
  adjust_in: "선택 품목 수량 증가",
  adjust_out: "선택 품목 수량 감소",
  defect_quarantine: "선택 부서의 정상 재고를 불량 격리",
  defect_restore: "격리 재고를 정상 복귀 (즉시)",
  defect_process: "격리 재고 폐기·재작업",
  supplier_return: "격리 재고를 공급처에 반품",
  internal_use_out: "창고 재고를 AS 또는 연구 용도로 반출",
};

// ──────────────────────────────────────────────────────────────────
// Transaction Type (DB TransactionLog.transaction_type)
//
// V2 SUB_TYPE 과 의미가 1:1 또는 N:1 로 매핑되는 경우가 많지만,
// 거래 기록은 더 오래된 어휘를 쓰므로 별도 관리.
// ──────────────────────────────────────────────────────────────────

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  RECEIVE: "원자재 입고",
  SHIP: "출고", // PF + warehouse out 조합이면 interpretShipLabel() 이 "출하" 반환
  PRODUCE: "생산",
  DISASSEMBLE: "분해", // ⚠️ 이전 일부 화면에서 "재작업" 으로 표기됨 — 본 사전 도입 후 "분해" 로 통일
  BACKFLUSH: "자동 차감",
  ADJUST: "수량 조정",
  TRANSFER_TO_PROD: "창고 → 부서",
  TRANSFER_TO_WH: "부서 → 창고",
  TRANSFER_DEPT: "부서 → 부서",
  MARK_DEFECTIVE: "새 불량",
  UNMARK_DEFECTIVE: "불량 해제",
  DEFECT_SCRAP: "불량 처리", // ⚠️ 이전 "폐기" — sub_type defect_process 와 통일
  SUPPLIER_RETURN: "원자재 반품",
  INTERNAL_USE: "사용출고",
};

// ──────────────────────────────────────────────────────────────────
// Request Type (결재 요청 큐 — backend stock_requests.request_type)
// ──────────────────────────────────────────────────────────────────

export const REQUEST_TYPE_LABEL: Record<string, string> = {
  raw_receive: "원자재 입고",
  raw_ship: "원자재 출고",
  warehouse_to_dept: "창고 → 부서",
  dept_to_warehouse: "부서 → 창고",
  dept_internal: "부서 내부 이동",
  mark_defective_wh: "창고 불량 등록",
  mark_defective_prod: "생산 불량 등록",
  supplier_return: "원자재 반품",
  internal_use: "AS·연구 사용출고",
  manual_adjustment: "수동 조정",
  package_out: "출하",
  defect_scrap: "불량 처리",
  defect_return: "원자재 반품",
  defect_disassemble: "불량 분해",
  // R 정상 재고 바로 처리 (격리 미경유)
  scrap_normal: "정상 폐기",
  rework_normal: "정상 재작업",
  return_normal: "정상 반품",
};

// ──────────────────────────────────────────────────────────────────
// Ship (출하) 정책 — P0-2
//
// 사용자 확인 (2026-05-27): ship 은 별도 work type 이 아니다.
// 입출고 탭의 "창고 → 부서" 또는 SHIP 거래가 PF(완제품) 품목이고
// 창고에서 외부로 나가는 방향이면 "출하" 로 해석한다.
// ──────────────────────────────────────────────────────────────────

export const SHIP_RULE = {
  description:
    "warehouse_io / warehouse 방향 out + 품목 종류가 PF(예: PA, PF, PR) 인 경우 → '출하' 로 표시",
  workTypeShouldNotExist: true, // V2 compose 에 ship 버튼 추가 금지
} as const;

/**
 * 거래/라인이 "출하" 로 해석되는지 판정.
 * - PF 계열 process_type_code (PR/PA/PF) + 창고에서 외부로 나가는 방향이면 출하.
 * - 다른 경우는 일반 SHIP / TRANSFER 라벨 사용.
 */
export function interpretShipLabel(opts: {
  transactionType: TransactionType;
  fromBucket?: IoBucket | null;
  toBucket?: IoBucket | null;
  itemProcessTypeCode?: string | null;
}): "출하" | null {
  if (opts.transactionType !== "SHIP") return null;
  const code = opts.itemProcessTypeCode ?? "";
  const isPF = code === "PR" || code === "PA" || code === "PF";
  if (!isPF) return null;
  const goingOutOfWarehouse = opts.fromBucket === "warehouse" && opts.toBucket === "none";
  return goingOutOfWarehouse ? "출하" : null;
}

// ──────────────────────────────────────────────────────────────────
// Bucket 라벨 (history 흐름 표시용)
// ──────────────────────────────────────────────────────────────────

export const BUCKET_LABEL: Record<IoBucket, string> = {
  warehouse: "창고",
  production: "부서",
  defective: "불량",
  none: "외부",
};

// ──────────────────────────────────────────────────────────────────
// Drift 검사 헬퍼 — glossary.test.ts 에서 사용
// ──────────────────────────────────────────────────────────────────

export function listAllSubTypes(): IoSubType[] {
  return Object.keys(SUB_TYPE_LABEL) as IoSubType[];
}

export function listAllTransactionTypes(): TransactionType[] {
  return Object.keys(TRANSACTION_TYPE_LABEL) as TransactionType[];
}

export function listAllWorkTypes(): IoWorkType[] {
  return Object.keys(WORK_TYPE_LABEL) as IoWorkType[];
}
