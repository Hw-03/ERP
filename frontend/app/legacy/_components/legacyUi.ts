"use client";

import type { Item, TransactionType } from "@/lib/api";
import { formatQty } from "@/lib/mes-format";
import { getTransactionLabel as mesGetTransactionLabel } from "@/lib/mes-status";

export const LEGACY_COLORS = {
  bg: "var(--c-bg)",
  s1: "var(--c-s1)",
  s2: "var(--c-s2)",
  s3: "var(--c-s3)",
  s4: "var(--c-s4)",
  border: "var(--c-border)",
  borderStrong: "var(--c-border-strong)",
  blue: "var(--c-blue)",
  green: "var(--c-green)",
  red: "var(--c-red)",
  yellow: "var(--c-yellow)",
  purple: "var(--c-purple)",
  cyan: "var(--c-cyan)",
  text: "var(--c-text)",
  muted: "var(--c-muted)",
  muted2: "var(--c-muted2)",
  panelGlow: "var(--c-panel-glow)",
} as const;

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

/**
 * 호환 wrapper — 본문은 frontend/lib/mes-format.ts::formatQty 로 위임.
 * 39 곳 호출처를 한 번에 옮기지 않기 위해 본 export 는 유지한다.
 * 새 코드는 mes-format.formatQty 를 직접 import 하기를 권장.
 */
export function formatNumber(value: number | string | null | undefined) {
  return formatQty(value);
}

/**
 * 호환 wrapper — 본문은 mes-status::getTransactionLabel 로 위임.
 * R4-5 (TX-DRIFT-001 후) — 16종 매핑은 mes-status TRANSACTION_META 가 정본.
 * 새 코드는 mes-status.getTransactionLabel 직접 import 권장.
 */
export function transactionLabel(type: TransactionType | string) {
  return mesGetTransactionLabel(type);
}

export function formatErpCode(code?: string | null, compact = true): string | null {
  if (!code) return null;
  if (!compact) return code;
  const parts = code.split("-");
  if (parts.length < 3) return code;
  const stripped = [...parts];
  stripped[2] = stripped[2].replace(/^0+(\d)/, "$1") || "0";
  return stripped.join("-");
}

const PROCESS_LABEL: Record<string, string> = {
  TR: "Tube Raw",
  TA: "Tube Ass'y",
  TF: "Tube Final",
  HR: "High-v Raw",
  HA: "High-v Ass'y",
  HF: "High-v Final",
  VR: "Vacuum Raw",
  VA: "Vacuum Ass'y",
  VF: "Vacuum Final",
  NR: "Neck Raw",
  NA: "Neck Ass'y",
  NF: "Neck Final",
  AR: "Assembly Raw",
  AA: "Assembly",
  AF: "Assembly Final",
  PR: "Pack Raw",
  PA: "Packaging",
  PF: "Pack Final",
};

export function processStageLabel(code?: string | null): string {
  if (!code) return "-";
  return PROCESS_LABEL[code] ?? code;
}

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

const OPTION_COLOR: Record<string, string> = {
  BG: "#60a5fa",
  WM: "#f97316",
  SV: "#a3a3a3",
};

export function optionColor(code?: string | null): string {
  if (!code) return LEGACY_COLORS.muted2;
  return OPTION_COLOR[code] ?? LEGACY_COLORS.muted2;
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

// 5.5-G: 거래 유형 아이콘 — 색상-only 신호 보강 (WCAG 1.4.1 두 채널).
// lucide-react 의 아이콘 이름만 반환하고 import 는 호출측에서 처리 (이 파일은 "use client" 라
// 트리쉐이킹 영향 최소화). 필요 시 호출측에서 매핑.
export type TransactionIconName =
  | "ArrowDownToLine"   // RECEIVE
  | "ArrowUpFromLine"   // SHIP
  | "Sliders"           // ADJUST
  | "Hammer"            // PRODUCE
  | "Recycle"           // BACKFLUSH
  | "Trash2"            // SCRAP
  | "AlertCircle"       // LOSS
  | "Wrench"            // DISASSEMBLE
  | "Undo2"             // RETURN
  | "BookmarkPlus"      // RESERVE
  | "BookmarkMinus"     // RESERVE_RELEASE
  | "ArrowRightLeft"    // TRANSFER_TO_PROD / TRANSFER_TO_WH / TRANSFER_DEPT
  | "ShieldAlert"       // MARK_DEFECTIVE
  | "PackageX"          // SUPPLIER_RETURN
  | "Activity";         // 기타 / 기본

export function transactionIconName(type: TransactionType | string): TransactionIconName {
  switch (type) {
    case "RECEIVE":
      return "ArrowDownToLine";
    case "SHIP":
      return "ArrowUpFromLine";
    case "ADJUST":
      return "Sliders";
    case "PRODUCE":
      return "Hammer";
    case "BACKFLUSH":
      return "Recycle";
    case "SCRAP":
      return "Trash2";
    case "LOSS":
      return "AlertCircle";
    case "DISASSEMBLE":
      return "Wrench";
    case "RETURN":
      return "Undo2";
    case "RESERVE":
      return "BookmarkPlus";
    case "RESERVE_RELEASE":
      return "BookmarkMinus";
    case "TRANSFER_TO_PROD":
    case "TRANSFER_TO_WH":
    case "TRANSFER_DEPT":
      return "ArrowRightLeft";
    case "MARK_DEFECTIVE":
      return "ShieldAlert";
    case "SUPPLIER_RETURN":
      return "PackageX";
    default:
      return "Activity";
  }
}

export function firstEmployeeLetter(name?: string | null) {
  if (!name) return "?";
  return name.trim().slice(0, 1);
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
