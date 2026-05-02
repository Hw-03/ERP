"use client";

/**
 * legacyUi.ts — DEXCOWIN MES legacy UI 의존 모듈 (정리 완료 후 잔존 부서 의존 함수만 보유).
 *
 * Round-10A~D 에서 LEGACY_COLORS / formatErpCode / optionColor / transactionIconName /
 * processStageLabel / getStockState / firstEmployeeLetter 등 도메인 무관 함수를
 * `@/lib/mes/*` 정본으로 모두 이전.
 *
 * Round-10E 에서 erpCodeDept / erpCodeDeptBadge / displayPart / LEGACY_FILE_TYPES /
 * LEGACY_PARTS / LEGACY_MODELS / buildItemSearchLabel / normalizeModel / itemMatchesKpi /
 * groupedItems (Item 도메인 8 항목) 정본 이전 + 호출처 직접 import 마이그레이션 완료 후
 * 본 파일의 wrapper 일괄 삭제.
 *
 * 본 파일에 남은 함수는 모두 **부서명 정규화 충돌 (DEPARTMENT_LABELS["연구"]="연구소"
 * vs mes-department alias) 의존** — Round-10F 에서 정책 통일 후 `@/lib/mes/department`
 * 와 `@/lib/mes/color` 로 흡수 예정.
 */

import type { TransactionType } from "@/lib/api";

// LEGACY_COLORS 본문은 @/lib/mes/color 정본으로 이전됨 (Round-10A #3).
// 본 파일 내부 함수들이 직접 참조하므로 import 후 re-export.
import { LEGACY_COLORS } from "@/lib/mes/color";
export { LEGACY_COLORS };

// Round-10F (#1): DEPARTMENT_LABELS / DEPARTMENT_ICONS / normalizeDepartment 본문은
// @/lib/mes/department 정본으로 이전. 정책 통일 (A) 적용 — "연구" → "연구" identity.
// 기존 "연구" → "연구소" 매핑은 폐기 (DB 표기 단일화).
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_ICONS,
  normalizeDepartment,
} from "@/lib/mes/department";
export { DEPARTMENT_LABELS, DEPARTMENT_ICONS, normalizeDepartment };

/**
 * 부서별 색상.
 *
 * **호환 보존:** wrapper 화 시도 (mes-department.getDepartmentFallbackColor 위임) 결과
 * "연구" 부서에서 동작 차이 발생 — DEPARTMENT_LABELS["연구"]="연구소" 정규화 후
 * 본 switch 의 case "연구" 가 hit 되지 않아 기존 코드는 default slate 를 반환한다.
 * mes-department 의 별칭 매핑("연구소"→"연구") 과 충돌하므로 본 함수는 본문 유지.
 *
 * 통합은 별도 작업으로 분리: Round-10F 에서 부서명 정규화 정책을 통일한 뒤 wrapper 화.
 */
export function employeeColor(value?: string | null) {
  switch (normalizeDepartment(value)) {
    case "조립":
      return "#1d4ed8"; // blue-700
    case "고압":
      return "#c2410c"; // orange-700
    case "진공":
      return "#6d28d9"; // violet-700
    case "튜닝":
      return "#0e7490"; // cyan-700
    case "서비스":
      return "#047857"; // emerald-700
    case "AS":
      return "#be185d"; // pink-700
    case "연구":
      return "#b45309"; // amber-700
    case "영업":
      return "#b91c1c"; // red-700
    case "출하":
      return "#0f766e"; // teal-700
    case "튜브":
      return "#4d7c0f"; // lime-700
    default:
      return "#475569"; // slate-600
  }
}

export function transactionColor(type: TransactionType) {
  switch (type) {
    case "RECEIVE":
      return LEGACY_COLORS.green;
    case "SHIP":
      return LEGACY_COLORS.red;
    case "ADJUST":
      return LEGACY_COLORS.yellow;
    case "PRODUCE":
      return LEGACY_COLORS.cyan;
    case "BACKFLUSH":
      return "#fb923c";
    case "SCRAP":
    case "LOSS":
    case "MARK_DEFECTIVE":
      return LEGACY_COLORS.red;
    case "RESERVE":
      return LEGACY_COLORS.yellow;
    case "RESERVE_RELEASE":
      return LEGACY_COLORS.muted2;
    case "TRANSFER_TO_PROD":
    case "TRANSFER_TO_WH":
    case "TRANSFER_DEPT":
      return LEGACY_COLORS.blue;
    case "DISASSEMBLE":
    case "RETURN":
    case "SUPPLIER_RETURN":
      return LEGACY_COLORS.muted;
    default:
      return LEGACY_COLORS.muted2;
  }
}
