"use client";

import { PackageSearch } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";
import { EmptyState } from "../common/EmptyState";
import { LoadFailureCard } from "../common/LoadFailureCard";
import { InventoryItemRow } from "./InventoryItemRow";

const PAGE_SIZE = 100;

type Props = {
  error: string | null;
  loading: boolean;
  filteredItems: Item[];
  displayLimit: number;
  setDisplayLimit: (updater: (prev: number) => number) => void;
  selectedItem: Item | null;
  onSelectItem: (item: Item | null) => void;
  activeFilterCount: number;
  hasKpiFilter: boolean;
  onRetry: () => void;
  onResetAllFilters: () => void;
};

export function InventoryItemsTable({
  error,
  loading,
  filteredItems,
  displayLimit,
  setDisplayLimit,
  selectedItem,
  onSelectItem,
  activeFilterCount,
  hasKpiFilter,
  onRetry,
  onResetAllFilters,
}: Props) {
  if (error) {
    return <LoadFailureCard message={error} onRetry={onRetry} />;
  }
  if (loading) {
    return (
      <div
        className="rounded-[24px] border px-4 py-4 text-base"
        style={{
          borderColor: LEGACY_COLORS.border,
          background: LEGACY_COLORS.s2,
          color: LEGACY_COLORS.muted2,
        }}
      >
        재고 데이터를 불러오는 중입니다...
      </div>
    );
  }
  if (filteredItems.length === 0) {
    return (
      <EmptyState
        variant={activeFilterCount > 0 || hasKpiFilter ? "filtered-out" : "no-search-result"}
        icon={<PackageSearch className="h-8 w-8" />}
        title="검색 결과가 없습니다."
        description="검색어 또는 필터를 초기화해 전체 품목을 다시 확인하세요."
        action={
          activeFilterCount > 0 || hasKpiFilter
            ? { label: "필터 초기화", onClick: onResetAllFilters }
            : undefined
        }
      />
    );
  }
  return (
    <>
      <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: LEGACY_COLORS.s2 }}>
              {(
                [
                  { label: "상태", nowrap: true, width: "80px" },
                  { label: "품목명", nowrap: false, minWidth: "180px" },
                  { label: "품목 코드", nowrap: true, width: "100px" },
                  { label: "부서", nowrap: true, width: "120px" },
                  { label: "현재고", nowrap: true, width: "84px" },
                  { label: "안전재고", nowrap: true, width: "80px" },
                ] as { label: string; nowrap: boolean; width?: string; minWidth?: string }[]
              ).map(({ label, nowrap, width, minWidth }) => (
                <th
                  key={label}
                  className={`border-b px-4 py-2.5 text-left text-sm font-bold${nowrap ? " whitespace-nowrap" : ""}`}
                  style={{
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                    width,
                    minWidth,
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.slice(0, displayLimit).map((item) => (
              <InventoryItemRow
                key={item.item_id}
                item={item}
                selected={selectedItem?.item_id === item.item_id}
                onSelect={onSelectItem}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filteredItems.length > displayLimit && (
        <button
          onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
          className="mt-4 w-full rounded-[24px] border py-4 text-base font-semibold"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.muted2,
          }}
        >
          100개 더 보기 (
          {formatNumber(Math.min(displayLimit + PAGE_SIZE, filteredItems.length))} /{" "}
          {formatNumber(filteredItems.length)})
        </button>
      )}
      {filteredItems.length > 0 && (
        <div className="mt-2 text-center text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {formatNumber(Math.min(displayLimit, filteredItems.length))} / {formatNumber(filteredItems.length)}개 표시
        </div>
      )}
    </>
  );
}
