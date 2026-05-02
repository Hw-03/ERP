"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, Search } from "lucide-react";
import type { Item, ProductModel, ShipPackage } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import { LabeledSelect } from "./_atoms";
import { DEPT_OPTIONS } from "./_constants";
import type { WorkType } from "./_constants";
import { ItemPickItemsTable } from "./_pick_parts/ItemPickItemsTable";
import { ItemPickPackageList } from "./_pick_parts/ItemPickPackageList";

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
  stageFilter,
  setStageFilter,
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
  stageFilter: string;
  setStageFilter: (v: string) => void;
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
            label="단계"
            value={stageFilter}
            onChange={setStageFilter}
            options={[
              { value: "ALL",  label: "전체" },
              { value: "RAW",  label: "원자재" },
              { value: "MID",  label: "중간공정" },
              { value: "DONE", label: "공정완료" },
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
                placeholder="품목명 · 품목 코드 · 바코드"
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
          <ItemPickPackageList
            packages={filteredPackages}
            selectedPackage={selectedPackage}
            onSelectPackage={onSelectPackage}
            searchTerm={localSearch}
          />
        ) : (
          <ItemPickItemsTable
            items={filteredItems}
            selectedItems={selectedItems}
            displayLimit={displayLimit}
            setDisplayLimit={setDisplayLimit}
            onToggleItem={onToggleItem}
            hasActiveFilter={hasActiveFilter}
            clearFilters={clearFilters}
          />
        )}
      </div>

      {/* 선택 현황 요약 */}
      <div
        className="flex items-center justify-between rounded-[12px] border px-3 py-2"
        style={{
          background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 6%, transparent)`,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 24%, transparent)`,
        }}
      >
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {isPackage
            ? selectedPackage
              ? `선택됨: ${selectedPackage.name}`
              : "선택된 패키지 없음"
            : selectedItems.size > 0
              ? `선택됨: ${selectedItems.size}건`
              : "선택된 품목 없음"}
        </span>
        {(isPackage ? !!selectedPackage : selectedItems.size > 0) && (
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>
            아래에서 수량을 조정하세요 ↓
          </span>
        )}
      </div>
    </div>
  );
}
