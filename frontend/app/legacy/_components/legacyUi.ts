"use client";

import type { Item, TransactionType } from "@/lib/api";

// LEGACY_COLORS 본문은 @/lib/mes/color 정본으로 이전됨 (Round-10A #3).
// 본 파일 내부 함수들이 직접 참조하므로 import 후 re-export.
import { LEGACY_COLORS } from "@/lib/mes/color";
export { LEGACY_COLORS };

// DepartmentEnum.value (str enum) 기준 — DB/API에서 "조립", "고압" 등이 그대로 반환됨
export const DEPARTMENT_LABELS: Record<string, string> = {
  "조립": "조립",
  "고압": "고압",
  "진공": "진공",
  "튜닝": "튜닝",
  "튜브": "튜브",
  "AS": "AS",
  "연구": "연구소",
  "영업": "영업",
  "출하": "출하",
  "기타": "기타",
};

export const DEPARTMENT_ICONS: Record<string, string> = {
  "조립": "조",
  "고압": "고",
  "진공": "진",
  "튜닝": "튜",
  "튜브": "튜",
  "AS": "A",
  "연구": "연",
  "영업": "영",
  "출하": "출",
  "기타": "기",
};

export const LEGACY_FILE_TYPES = ["전체"] as const;
export const LEGACY_PARTS = ["전체", "자재창고", "조립출하", "고압파트", "진공파트", "튜닝파트"] as const;
export const LEGACY_MODELS = ["전체", "DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO"] as const;

export function normalizeDepartment(value?: string | null) {
  if (!value) return "기타";
  return DEPARTMENT_LABELS[value] ?? value;
}

/**
 * 부서별 색상.
 *
 * **호환 보존:** wrapper 화 시도 (mes-department.getDepartmentFallbackColor 위임) 결과
 * "연구" 부서에서 동작 차이 발생 — DEPARTMENT_LABELS["연구"]="연구소" 정규화 후
 * 본 switch 의 case "연구" 가 hit 되지 않아 기존 코드는 default slate 를 반환한다.
 * mes-department 의 별칭 매핑("연구소"→"연구") 과 충돌하므로 본 함수는 본문 유지.
 *
 * 통합은 별도 작업으로 분리: docs/research/2026-05-04-transaction-type-drift.md 와 함께
 * 부서명 정규화 정책을 통일한 뒤 wrapper 화한다.
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

// Round-10E (#2): displayPart 본문은 @/lib/mes/process 정본으로 이전.
export { displayPart } from "@/lib/mes/process";

// Round-10E (#1): erpCodeDept / erpCodeDeptBadge 본문은 @/lib/mes/process 정본으로 이전.
// erpCodeDeptBadge 의 default getColor=employeeColor 만 본 wrapper 에서 호환 보존
// (정본 모듈은 require parameter — 활성 호출처는 모두 useDeptColorLookup() 명시 전달).
import {
  erpCodeDept as erpCodeDeptCanonical,
  erpCodeDeptBadge as erpCodeDeptBadgeCanonical,
} from "@/lib/mes/process";

export const erpCodeDept = erpCodeDeptCanonical;

export function erpCodeDeptBadge(
  erp_code?: string | null,
  getColor: (name?: string | null) => string = employeeColor,
) {
  return erpCodeDeptBadgeCanonical(erp_code, getColor);
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

export function buildItemSearchLabel(item: Item) {
  return `${item.erp_code} / ${item.item_name}`;
}

export function normalizeModel(value?: string | null) {
  return value && value.trim() ? value : "공용";
}

export function itemMatchesKpi(item: Item, kpi: string) {
  const qty = Number(item.quantity);
  const min = item.min_stock == null ? null : Number(item.min_stock);
  if (kpi === "정상") return qty > 0 && !(min != null && qty < min);
  if (kpi === "부족") return qty > 0 && min != null && qty < min;
  if (kpi === "품절") return qty <= 0;
  return true;
}

export function groupedItems(items: Item[]) {
  const map = new Map<
    string,
    {
      key: string;
      representative: Item;
      quantity: number;
      count: number;
    }
  >();

  for (const item of items) {
    const key = item.item_name.trim().toLowerCase();
    const current = map.get(key);
    if (current) {
      current.quantity += Number(item.quantity);
      current.count += 1;
    } else {
      map.set(key, {
        key,
        representative: item,
        quantity: Number(item.quantity),
        count: 1,
      });
    }
  }

  return Array.from(map.values());
}
