---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_steps/ItemPickStep.tsx
status: active
updated: 2026-04-27
source_sha: b524a820951e
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# ItemPickStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_steps/ItemPickStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `15897` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps|frontend/app/legacy/_components/_warehouse_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 368줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, Check, Search } from "lucide-react";
import type { Item, ProductModel, ShipPackage } from "@/lib/api";
import { EmptyState } from "../common/EmptyState";
import {
  LEGACY_COLORS,
  formatNumber,
  getStockState,
} from "../legacyUi";
import { LabeledSelect } from "./_atoms";
import {
  CATEGORY_LABEL,
  DEPT_OPTIONS,
  PAGE_SIZE,
} from "./_constants";
import type { WorkType } from "./_constants";

export function ItemPickStep({
  workType,
  filteredItems,
  filteredPackages,
  selectedItems,
  selectedPackage,
  onToggleItem,
  onSelectPackage,
  productModels,
  dept,
  setDept,
  modelFilter,
  setModelFilter,
  categoryFilter,
  setCategoryFilter,
  localSearch,
  setLocalSearch,
  displayLimit,
  setDisplayLimit,
  hiddenSelectedCount,
  hasActiveFilter,
  clearFilters,
  pendingScrollId,
  onScrolled,
}: {
  workType: WorkType;
  filteredItems: Item[];
  filteredPackages: ShipPackage[];
  selectedItems: Map<string, number>;
  selectedPackage: ShipPackage | null;
  onToggleItem: (id: string) => void;
  onSelectPackage: (pkg: ShipPackage | null) => void;
  productModels: ProductModel[];
  dept: string;
  setDept: (v: string) => void;
  modelFilter: string;
  setModelFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  localSearch: string;
  setLocalSearch: (v: string) => void;
  displayLimit: number;
  setDisplayLimit: Dispatch<SetStateAction<number>>;
  hiddenSelectedCount: number;
  hasActiveFilter: boolean;
  clearFilters: () => void;
  pendingScrollId: string | null;
  onScrolled: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingScrollId || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-item-id="${pendingScrollId}"]`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      onScrolled();
    }
  }, [pendingScrollId, filteredItems, onScrolled]);

  const isPackage = workType === "package-out";

  return (
    <div className="space-y-3">
      {/* 필터로 가려진 선택 품목 안내 */}
      {hiddenSelectedCount > 0 && (
        <div
          className="flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-xs"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-bold">
              선택한 {hiddenSelectedCount}건이 현재 필터로 가려졌습니다
            </span>
          </div>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-[10px] border px-2.5 py-1 text-[11px] font-bold transition-colors hover:brightness-125"
              style={{
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
                color: LEGACY_COLORS.yellow,
                background: "transparent",
              }}
            >
              필터 해제
            </button>
          )}
        </div>
      )}

      {/* 필터 */}
      {!isPackage ? (
        <div className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-2">
          <LabeledSelect
            label="부서"
            value={dept}
            onChange={setDept}
            options={DEPT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <LabeledSelect
            label="모델"
            value={modelFilter}
            onChange={setModelFilter}
            options={["전체", "공용", ...productModels.map((m) => m.model_name ?? "")].map((v) => ({ value: v, label: v }))}
          />
          <LabeledSelect
            label="분류"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "ALL", label: "전체" },
              { value: "RM", label: "원자재" },
              { value: "A", label: "조립품" },
              { value: "F", label: "반제품" },
              { value: "FG", label: "완제품" },
            ]}
          />
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
              검색
            </span>
            <div
              className="flex items-center gap-1.5 rounded-[10px] border px-2 py-1.5"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
              <input
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="품목명 · ERP코드 · 바코드"
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
            </div>
          </label>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-[12px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="패키지명 · 코드"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: LEGACY_COLORS.text }}
          />
        </div>
      )}

      {/* 결과 영역 */}
      <div
        ref={listRef}
        className="scrollbar-hide max-h-[440px] overflow-y-auto rounded-[16px] border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, overscrollBehavior: "contain" }}
      >
        {isPackage ? (
          <ul className="space-y-1.5 p-2">
            {filteredPackages.map((pkg) => {
              const active = selectedPackage?.package_id === pkg.package_id;
              return (
                <li key={pkg.package_id}>
                  <button
                    onClick={() => onSelectPackage(active ? null : pkg)}
                    className="flex w-full items-center justify-between gap-2 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:brightness-110"
                    style={{
                      background: active ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)` : LEGACY_COLORS.s1,
                      borderLeft: `3px solid ${active ? LEGACY_COLORS.purple : "transparent"}`,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                        {pkg.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {pkg.package_code} · {pkg.items.length}종
                      </div>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.purple }} />}
                  </button>
                </li>
              );
            })}
            {filteredPackages.length === 0 && (
              <li>
                <EmptyState
                  variant={localSearch ? "no-search-result" : "no-data"}
                  compact
                  description={localSearch ? "검색어를 다시 확인해 주세요." : "등록된 패키지가 없습니다."}
                />
              </li>
            )}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
