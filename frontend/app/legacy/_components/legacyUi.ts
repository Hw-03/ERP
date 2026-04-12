"use client";

import type { Item, TransactionType } from "@/lib/api";

export const LEGACY_COLORS = {
  bg: "#080a10",
  s1: "#10121a",
  s2: "#181b26",
  s3: "#1f2333",
  border: "rgba(255,255,255,.07)",
  blue: "#4f8ef7",
  green: "#1fd17a",
  red: "#f25f5c",
  yellow: "#f4b942",
  purple: "#9b72f8",
  cyan: "#06b6d4",
  text: "#eef0f8",
  muted: "#5a5f75",
  muted2: "#8890aa",
} as const;

export const DEPARTMENT_LABELS: Record<string, string> = {
  "議곕┰": "조립",
  "怨좎븬": "고압",
  "吏꾧났": "진공",
  "?쒕떇": "튜닝",
  "?쒕툕": "튜브",
  AS: "AS",
  "?곌뎄": "연구",
  "?곸뾽": "영업",
  "異쒗븯": "출하",
  "湲고?": "기타",
};

export const DEPARTMENT_ICONS: Record<string, string> = {
  조립: "🔧",
  고압: "⚡",
  진공: "🔩",
  튜닝: "🎛",
  튜브: "🧪",
  AS: "🛠",
  연구: "🧬",
  영업: "💼",
  출하: "📦",
  기타: "📁",
};

export const FILE_TYPE_BADGES: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  원자재: { label: "원자재", bg: "rgba(79,142,247,.15)", color: LEGACY_COLORS.blue },
  조립자재: { label: "조립자재", bg: "rgba(31,209,122,.15)", color: LEGACY_COLORS.green },
  발생부자재: { label: "발생부자재", bg: "rgba(244,185,66,.15)", color: LEGACY_COLORS.yellow },
  완제품: { label: "완제품", bg: "rgba(155,114,248,.15)", color: LEGACY_COLORS.purple },
  데모: { label: "데모", bg: "rgba(6,182,212,.15)", color: LEGACY_COLORS.cyan },
  미분류: { label: "미분류", bg: "rgba(136,144,170,.15)", color: LEGACY_COLORS.muted2 },
};

export function normalizeDepartment(value?: string | null) {
  if (!value) return "기타";
  return DEPARTMENT_LABELS[value] ?? value;
}

export function employeeColor(value?: string | null) {
  switch (normalizeDepartment(value)) {
    case "조립":
      return LEGACY_COLORS.blue;
    case "고압":
      return LEGACY_COLORS.yellow;
    case "진공":
      return LEGACY_COLORS.purple;
    case "튜닝":
      return LEGACY_COLORS.cyan;
    case "튜브":
      return LEGACY_COLORS.green;
    case "출하":
      return LEGACY_COLORS.red;
    case "연구":
      return "#8b5cf6";
    case "영업":
      return "#ec4899";
    case "AS":
      return "#f97316";
    default:
      return LEGACY_COLORS.muted2;
  }
}

export function fileTypeBadge(value?: string | null) {
  if (!value) return FILE_TYPE_BADGES["미분류"];
  return FILE_TYPE_BADGES[value] ?? FILE_TYPE_BADGES["미분류"];
}

export function getStockState(quantity: number, minStock?: number | null) {
  if (quantity <= 0) {
    return {
      label: "품절",
      className: "szero",
      color: LEGACY_COLORS.red,
    };
  }
  if (minStock != null && quantity < minStock) {
    return {
      label: "부족",
      className: "slow",
      color: LEGACY_COLORS.yellow,
    };
  }
  return {
    label: "정상",
    className: "sok",
    color: LEGACY_COLORS.green,
  };
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
  return `${item.item_code} · ${item.item_name}`;
}

export function normalizeModel(value?: string | null) {
  return value && value.trim() ? value : "공용";
}
