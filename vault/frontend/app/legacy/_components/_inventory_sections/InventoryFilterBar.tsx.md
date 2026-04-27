---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_inventory_sections/InventoryFilterBar.tsx
status: active
updated: 2026-04-27
source_sha: 894a96bf6d71
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryFilterBar.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_inventory_sections/InventoryFilterBar.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `6890` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections|frontend/app/legacy/_components/_inventory_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { ChevronDown, Filter, Search, Sparkles, TrendingUp } from "lucide-react";
import type { ProductModel } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";

const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
  { label: "AS", value: "AS" },
];

function Chip({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-full border px-4 py-2 text-sm font-semibold transition-all hover:brightness-110"
      style={{
        background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
  );
}

type FiltersProps = {
  open: boolean;
  selectedDepts: string[];
  selectedModels: string[];
  productModels: ProductModel[];
  toggleDept: (v: string) => void;
  toggleModel: (v: string) => void;
  onClearDepts: () => void;
  onClearModels: () => void;
};

export function InventoryFilters({
  open,
  selectedDepts,
  selectedModels,
  productModels,
  toggleDept,
  toggleModel,
  onClearDepts,
  onClearModels,
}: FiltersProps) {
  if (!open) return null;
  return (
    <div className="mt-2.5 grid gap-2.5 xl:grid-cols-2">
      <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />
          부서 구분
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Chip active={selectedDepts.length === 0} label="전체" onClick={onClearDepts} tone={LEGACY_COLORS.green} />
          {DEPT_OPTIONS.filter((o) => o.value !== "ALL").map((opt) => (
            <Chip
              key={opt.value}
              active={selectedDepts.includes(opt.value)}
              label={opt.label}
              onClick={() => toggleDept(opt.value)}
              tone={LEGACY_COLORS.green}
            />
          ))}
        </div>
      </div>
      <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <TrendingUp className="h-4 w-4" style={{ color: LEGACY_COLORS.cyan }} />
          모델 구분
        </div>
        <div className="grid grid-cols-3 gap-2 overflow-x-auto">
          <Chip active={selectedModels.length === 0} label="전체" onClick={onClearModels} tone={LEGACY_COLORS.cyan} />
          {productModels.map((m) => (
            <Chip
              key={m.model_name}
              active={selectedModels.includes(m.model_name ?? "")}
              label={m.model_name ?? ""}
              onClick={() => toggleModel(m.model_name ?? "")}
              tone={LEGACY_COLORS.cyan}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type StickyHeaderProps = {
  searchValue: string;
  onSearchChange: (v: string) => void;
  count: number;
  activeFilterCount: number;
  filtersOpen: boolean;
  isFiltered: boolean;
  onToggleFilters: () => void;
};

export function InventoryTableStickyHeader({
  searchValue,
  onSearchChange,
  activeFilterCount,
  filtersOpen,
  isFiltered,
  onToggleFilters,
}: StickyHeaderProps) {
  return (
    <div
      className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 rounded-t-[28px]"
      style={{
        background: LEGACY_COLORS.bg,
        backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))",
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3 pt-5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
            자재 목록
          </span>
          {isFiltered && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
                color: LEGACY_COLORS.blue,
              }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEGACY_COLORS.blue }} />
              필터 적용 중
            </span>
          )}
        </div>
        <div
          className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[14px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="품명 · ERP코드 · 위치 · 공급처 검색"
            className="flex-1 bg-transparent text-base outline-none"
            style={{ color: LEGACY_COLORS.text }}
          />
        </div>
        <button
          onClick={onToggleFilters}
          className="flex shrink-0 items-center gap-1.5 rounded-[14px] border px-3 py-2 text-sm font-semibold transition-colors hover:brightness-110"
          style={{
            background: filtersOpen
              ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
              : LEGACY_COLORS.s2,
            borderColor: filtersOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            color: filtersOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
          }}
          aria-expanded={filtersOpen}
        >
          <Filter className="h-3.5 w-3.5" />
          필터
          {activeFilterCount > 0 && (
            <span
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[11px] font-bold leading-none"
              style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
            >
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: filtersOpen ? "rotate(180deg)" : undefined }}
          />
        </button>
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
