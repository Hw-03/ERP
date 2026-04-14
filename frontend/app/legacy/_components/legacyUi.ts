"use client";

import type { Item, TransactionType } from "@/lib/api";

export const LEGACY_COLORS = {
  bg:     "var(--c-bg)",
  s1:     "var(--c-s1)",
  s2:     "var(--c-s2)",
  s3:     "var(--c-s3)",
  border: "var(--c-border)",
  blue:   "var(--c-blue)",
  green:  "var(--c-green)",
  red:    "var(--c-red)",
  yellow: "var(--c-yellow)",
  purple: "var(--c-purple)",
  cyan:   "var(--c-cyan)",
  text:   "var(--c-text)",
  muted:  "var(--c-muted)",
  muted2: "var(--c-muted2)",
} as const;

export const DEPARTMENT_LABELS: Record<string, string> = {
  조립: "조립",
  고압: "고압",
  진공: "진공",
  튜닝: "튜닝",
  튜브: "튜브",
  AS: "AS",
  연구: "연구",
  영업: "영업",
  출하: "출하",
  기타: "기타",
};

export const DEPARTMENT_ICONS: Record<string, string> = {
  조립: "🔧",
  고압: "⚡",
  진공: "🌀",
  튜닝: "🧪",
  튜브: "🧵",
  AS: "🛠",
  연구: "📘",
  영업: "💼",
  출하: "📦",
  기타: "🏷",
};

export const FILE_TYPE_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  원자재: { label: "원자재", bg: "rgba(79,142,247,.15)", color: LEGACY_COLORS.blue },
  조립자재: { label: "조립자재", bg: "rgba(31,209,122,.15)", color: LEGACY_COLORS.green },
  발생부자재: { label: "발생부자재", bg: "rgba(244,185,66,.15)", color: LEGACY_COLORS.yellow },
  완제품: { label: "완제품", bg: "rgba(155,114,248,.15)", color: LEGACY_COLORS.purple },
  데모: { label: "데모", bg: "rgba(6,182,212,.15)", color: LEGACY_COLORS.cyan },
  미분류: { label: "미분류", bg: "rgba(136,144,170,.15)", color: LEGACY_COLORS.muted2 },
};

export const LEGACY_FILE_TYPES = ["전체", "원자재", "조립자재", "발생부자재", "완제품", "미분류"] as const;
export const LEGACY_PARTS = ["전체", "자재창고", "조립출하", "고압파트", "진공파트", "튜닝파트", "출하"] as const;
export const LEGACY_MODELS = ["전체", "공용", "DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO"] as const;
export const KPI_FILTERS = ["전체", "정상", "부족", "품절"] as const;

export function normalizeDepartment(value?: string | null) {
  if (!value) return "기타";
  return DEPARTMENT_LABELS[value] ?? value;
}

// HTML inventory_v2.html DEPT_COLOR 기준
export function employeeColor(value?: string | null) {
  switch (normalizeDepartment(value)) {
    case "조립":
      return "#4f8ef7";
    case "고압":
      return "#f4b942";
    case "진공":
      return "#9b72f8";
    case "튜닝":
      return "#06b6d4";
    case "튜브":
      return "#1fd17a";
    case "AS":
      return "#e879f9";
    case "연구":
      return "#f97316";
    case "영업":
      return "#f25f5c";
    case "출하":
      return "#64748b";
    default:
      return "#5a5f75";
  }
}

export function fileTypeBadge(value?: string | null) {
  if (!value) return FILE_TYPE_BADGES["미분류"];
  return FILE_TYPE_BADGES[value] ?? FILE_TYPE_BADGES["미분류"];
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

export function formatNumber(value: number | string | null | undefined) {
  if (value == null) return "-";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "-";
  return numeric.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

export function transactionLabel(type: TransactionType) {
  switch (type) {
    case "RECEIVE":
      return "입고";
    case "SHIP":
      return "출고";
    case "ADJUST":
      return "조정";
    case "PRODUCE":
      return "생산입고";
    case "BACKFLUSH":
      return "자동차감";
    default:
      return type;
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
    default:
      return LEGACY_COLORS.muted2;
  }
}

export function firstEmployeeLetter(name?: string | null) {
  if (!name) return "?";
  return name.trim().slice(0, 1);
}

export function buildItemSearchLabel(item: Item) {
  return `${item.item_code} / ${item.item_name}`;
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
