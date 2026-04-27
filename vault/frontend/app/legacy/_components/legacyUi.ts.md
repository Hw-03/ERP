---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/legacyUi.ts
status: active
updated: 2026-04-27
source_sha: 4d45b19c92b1
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# legacyUi.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/legacyUi.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `9182` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 330줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````ts
"use client";

import type { Item, TransactionType } from "@/lib/api";

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

export function employeeColor(value?: string | null) {
  switch (normalizeDepartment(value)) {
    case "조립":
      return "#3b82f6";
    case "고압":
      return "#f97316";
    case "진공":
      return "#8b5cf6";
    case "튜닝":
      return "#06b6d4";
    case "서비스":
      return "#10b981";
    case "AS":
      return "#ec4899";
    case "연구":
      return "#f59e0b";
    case "영업":
      return "#ef4444";
    case "출하":
      return "#14b8a6";
    case "튜브":
      return "#84cc16";
    default:
      return "#94a3b8";
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

export function formatNumber(value: number | string | null | undefined) {
  if (value == null) return "-";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "-";
  return numeric.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

export function transactionLabel(type: TransactionType | string) {
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
    case "SCRAP":
      return "폐기";
    case "LOSS":
      return "분실";
    case "DISASSEMBLE":
      return "분해";
    case "RETURN":
      return "반품";
    case "RESERVE":
      return "예약";
    case "RESERVE_RELEASE":
      return "예약해제";
    default:
      return type;
  }
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

export function erpCodeDeptBadge(erp_code?: string | null): { label: string; color: string; bg: string } | null {
  const dept = erpCodeDept(erp_code);
  if (!dept) return null;
  const color = employeeColor(dept);
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
