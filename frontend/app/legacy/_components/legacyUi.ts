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

export function displayPart(value?: string | null) {
  if (!value) return "-";
  const labels: Record<string, string> = {
    "자재창고": "자재창고",
    "조립출하": "조립출하",
    "고압파트": "고압파트",
    "진공파트": "진공파트",
    "튜닝파트": "튜닝파트",
    "출하": "출하",
  };
  return labels[value] ?? value;
}

export function getStockState(quantity: number, minStock?: number | null) {
  if (quantity <= 0) {
    return { label: "품절", color: LEGACY_COLORS.red };
  }
  if (minStock != null && quantity < minStock) {
    return { label: "부족", color: LEGACY_COLORS.yellow };
  }
  return { label: "정상", color: LEGACY_COLORS.green };
}

// Round-10D #2: 본문 lib/mes-format.ts 정본으로 이전. 호환 re-export 만 유지.
export { formatErpCode } from "@/lib/mes-format";

// Round-10D #5: PROCESS_LABEL/processStageLabel 본문 lib/mes/process.ts 정본으로 이전.
// PROCESS_LABEL 은 본 파일에서 외부 export 한 적 없어 wrapper 만 노출.
export { processStageLabel } from "@/lib/mes/process";

const PROCESS_TO_DEPT: Record<string, string> = {
  TR: "튜브", TA: "튜브", TF: "튜브",
  HR: "고압", HA: "고압", HF: "고압",
  VR: "진공", VA: "진공", VF: "진공",
  NR: "튜닝", NA: "튜닝", NF: "튜닝",
  AR: "조립", AA: "조립", AF: "조립",
  PR: "출하", PA: "출하", PF: "출하",
};

export function erpCodeDept(erp_code?: string | null): string | null {
  if (!erp_code) return null;
  const parts = erp_code.split("-");
  if (parts.length < 2) return null;
  return PROCESS_TO_DEPT[parts[1]] ?? null;
}

export function erpCodeDeptBadge(
  erp_code?: string | null,
  getColor: (name?: string | null) => string = employeeColor,
): { label: string; color: string; bg: string } | null {
  const dept = erpCodeDept(erp_code);
  if (!dept) return null;
  const color = getColor(dept);
  return { label: dept, color, bg: `color-mix(in srgb, ${color} 12%, transparent)` };
}

// Round-10D #3: optionColor 본문 lib/mes/color.ts 정본으로 이전.
// OPTION_COLOR 는 본 파일에서 export 한 적 없음 — wrapper 만 노출.
export { optionColor } from "@/lib/mes/color";

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

// Round-10D #4: TransactionIconName 타입 + transactionIconName 본문 lib/mes-status.ts 정본으로 이전.
// 호환 re-export 만 유지.
export type { TransactionIconName } from "@/lib/mes-status";
export { transactionIconName } from "@/lib/mes-status";

// Round-10D #1: 본문 lib/mes/employee.ts 정본으로 이전. 호환 re-export 만 유지.
export { firstEmployeeLetter } from "@/lib/mes/employee";

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
