"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, Check, Search } from "lucide-react";
import type { Item, ProductModel, ShipPackage } from "@/lib/api";
import { EmptyState } from "../common/EmptyState";
import {
  LEGACY_COLORS,
  getStockState,
} from "../legacyUi";
import { formatQty } from "@/lib/mes/format";
import { LabeledSelect } from "./_atoms";
import {
  PROCESS_TYPE_LABEL,
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
          </ul>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s2 }}>
              <tr
                className="text-left text-[10px] font-bold uppercase tracking-[1.5px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                <th className="w-10 px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}></th>
                <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>품목명 (품목 코드)</th>
                <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>모델</th>
                <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>분류</th>
                <th className="px-2 py-2 text-center" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>상태</th>
                <th className="px-3 py-2 text-right" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>현재 재고</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.slice(0, displayLimit).map((item) => {
                const active = selectedItems.has(item.item_id);
                const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
                const categoryLabel = item.process_type_code ? (PROCESS_TYPE_LABEL[item.process_type_code] ?? item.process_type_code) : "-";
                return (
                  <tr
                    key={item.item_id}
                    data-item-id={item.item_id}
                    onClick={() => onToggleItem(item.item_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleItem(item.item_id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={active}
                    className="cursor-pointer transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
                    style={{
                      background: active ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)` : "transparent",
                    }}
                  >
                    <td className="px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-[4px] border"
                        style={{
                          background: active ? LEGACY_COLORS.blue : "transparent",
                          borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                        }}
                      >
                        {active && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                    </td>
                    <td className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                        {item.item_name}
                      </span>
                      <span className="ml-1 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                        ({item.erp_code ?? "-"})
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs" style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      {item.legacy_model ?? "-"}
                    </td>
                    <td className="px-2 py-2 text-xs" style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      {categoryLabel}
                    </td>
                    <td className="px-2 py-2 text-center" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 14%, transparent)` }}
                      >
                        {stock.label}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2 text-right text-sm font-black tabular-nums"
                      style={{
                        color: Number(item.quantity) > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                        borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                      }}
                    >
                      {formatQty(item.quantity)}
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-2">
                    <EmptyState
                      variant={hasActiveFilter ? "filtered-out" : "no-data"}
                      compact
                      description={
                        hasActiveFilter
                          ? "필터를 해제하면 다시 표시됩니다."
                          : "조회할 품목이 없습니다."
                      }
                      action={
                        hasActiveFilter
                          ? { label: "필터 해제", onClick: clearFilters }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {!isPackage && filteredItems.length > displayLimit && (
          <div className="p-2">
            <button
              type="button"
              onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
              className="w-full rounded-[12px] border py-2.5 text-xs font-semibold"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              100개 더 보기 ({formatQty(Math.min(displayLimit + PAGE_SIZE, filteredItems.length))} / {formatQty(filteredItems.length)})
            </button>
          </div>
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
