"use client";

import { useMemo } from "react";
import { PackageSearch } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { EmptyState } from "../common/EmptyState";
import { LoadFailureCard } from "../common/LoadFailureCard";
import { InventoryItemRow } from "./InventoryItemRow";
import { useChunkedRender } from "../_hooks/useChunkedRender";

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
  imageManifest?: Record<string, string>;
  compact?: boolean;
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
  imageManifest,
  compact,
}: Props) {
  const headerColumns = compact
    ? [
        { label: "상태", nowrap: true, width: "90px" },
        { label: "품목명", nowrap: false, minWidth: "140px" },
      ]
    : [
        { label: "상태", nowrap: true, width: "90px" },
        { label: "이미지", nowrap: true, width: "60px", center: true, hidden: true },
        { label: "품목명", nowrap: false, minWidth: "140px" },
        { label: "품목 코드", nowrap: true, width: "160px", hidden: true },
        { label: "부서별 재고", nowrap: true, width: "220px", center: true, hidden: true },
      ];
  // 좌측 사이드바 탭 전환 시 실제 렌더 비용(Long Task) 완화: displayLimit(최대
  // 100개) 전부를 한 번에 마운트하지 않고 chunk(20개) 단위로 나눠 그린다.
  // 스크롤이 sentinel 근처에 오면 다음 chunk를 이어 붙인다. 행 하나당 이미지 +
  // 게이지 + 배지 계산이 있어 50개 단위로도 간헐적 Long Task가 남아 20으로 축소.
  // useMemo 필수 — .slice()는 매 렌더 새 배열 참조를 만드는데, useChunkedRender는
  // items 참조가 바뀌면 count를 chunkSize로 리셋한다. 메모 없이 넘기면 스크롤로
  // count가 늘어나 리렌더될 때마다 새 slice 참조가 리셋을 유발해 chunk가
  // 영원히 20개에서 멈춘다.
  const displayedItems = useMemo(() => filteredItems.slice(0, displayLimit), [filteredItems, displayLimit]);
  const { visible: chunkedItems, sentinelRef, hasMore: hasMoreChunk } = useChunkedRender(displayedItems, 20);

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
              {headerColumns.map(({ label, nowrap, width, minWidth, center, hidden }) => (
                <th
                  key={label}
                  scope="col"
                  className={`border-b px-4 py-2.5 text-sm font-bold${nowrap ? " whitespace-nowrap" : ""}${center ? " text-center" : " text-left"}${hidden ? " hidden sm:table-cell" : ""}`}
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
              <th
                scope="col"
                className={`border-b px-4 py-2.5 text-sm font-bold whitespace-nowrap ${compact ? "text-center" : "text-right sm:text-center"}`}
                style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width: compact ? "104px" : "160px" }}
              >
                총재고
              </th>
              {!compact && (
                <th
                  scope="col"
                  className="hidden sm:table-cell border-b px-4 py-2.5 text-sm font-bold whitespace-nowrap text-center"
                  style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width: "160px" }}
                >
                  안전재고
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {chunkedItems.map((item) => (
              <InventoryItemRow
                key={item.item_id}
                item={item}
                selected={selectedItem?.item_id === item.item_id}
                onSelect={onSelectItem}
                imageFilename={item.mes_code ? imageManifest?.[item.mes_code] : undefined}
                compact={compact}
              />
            ))}
          </tbody>
        </table>
        {hasMoreChunk && <div ref={sentinelRef as React.RefObject<HTMLDivElement>} aria-hidden className="h-px" />}
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
          100개 더 보기 ({formatQty(Math.min(displayLimit + PAGE_SIZE, filteredItems.length))} / {formatQty(filteredItems.length)})
        </button>
      )}
      {filteredItems.length > 0 && (
        <div className="mt-2 text-center text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {formatQty(Math.min(displayLimit, filteredItems.length))} / {formatQty(filteredItems.length)}개 표시
        </div>
      )}
    </>
  );
}
