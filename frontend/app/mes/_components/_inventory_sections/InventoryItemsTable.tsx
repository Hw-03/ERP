"use client";

import { useMemo } from "react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { ReadEmpty, ReadFailure, ReadLoading } from "../common/ReadState";
import { InventoryItemRow } from "./InventoryItemRow";
import { useChunkedRender } from "../_hooks/useChunkedRender";

const PAGE_SIZE = 100;

type Props = {
  error: string | null;
  refreshError?: string | null;
  loading: boolean;
  filteredItems: Item[];
  displayLimit: number;
  setDisplayLimit: (updater: (prev: number) => number) => void;
  selectedItem: Item | null;
  onSelectItem: (item: Item | null) => void;
  activeFilterCount: number;
  hasKpiFilter: boolean;
  hasSearch?: boolean;
  onRetry: () => void;
  onResetAllFilters: () => void;
  imageManifest?: Record<string, string>;
  compact?: boolean;
};

export function InventoryItemsTable({
  error,
  refreshError,
  loading,
  filteredItems,
  displayLimit,
  setDisplayLimit,
  selectedItem,
  onSelectItem,
  activeFilterCount,
  hasKpiFilter,
  hasSearch = false,
  onRetry,
  onResetAllFilters,
  imageManifest,
  compact,
}: Props) {
  const headerColumns = compact
    ? [
        { label: "상태", nowrap: true, width: "90px", center: true },
        { label: "품목명", nowrap: false, minWidth: "140px" },
      ]
    : [
        { label: "상태", nowrap: true, width: "90px", center: true },
        { label: "이미지", nowrap: true, width: "60px", center: true, hidden: true },
        { label: "품목명", nowrap: false, minWidth: "140px" },
        { label: "품목 코드", nowrap: true, width: "160px", center: true, hidden: true },
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
    return <ReadFailure message={error} onRetry={onRetry} />;
  }
  if (loading && compact) {
    return <ReadLoading label="재고 데이터를 불러오는 중입니다..." variant={compact ? "list" : "table"} />;
  }
  if (!loading && filteredItems.length === 0) {
    return (
      <div className="space-y-3">
        {refreshError && (
          <ReadFailure
            message={refreshError}
            refresh
            onRetry={onRetry}
          />
        )}
        <ReadEmpty hasSearch={hasSearch} hasFilters={activeFilterCount > Number(hasSearch) || hasKpiFilter} onReset={onResetAllFilters} />
      </div>
    );
  }
  return (
    <>
      {refreshError && (
        <div className="mb-3">
          <ReadFailure
            message={refreshError}
            refresh
            onRetry={onRetry}
          />
        </div>
      )}
      <div
        className={`${compact ? "overflow-x-auto border" : "overflow-clip"} rounded-[24px]`}
        style={compact ? { borderColor: LEGACY_COLORS.border } : undefined}
      >
        {!compact && (
          <div
            aria-hidden
            data-testid="inventory-table-corner-mask"
            className="pointer-events-none sticky top-[71px] z-20 -mb-6 flex h-6 justify-between"
          >
            <span
              className="h-6 w-6"
              style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 23px, var(--c-inventory-table-corner-backdrop) 24px)" }}
            />
            <span
              className="h-6 w-6"
              style={{ background: "radial-gradient(circle at 0 100%, transparent 0 23px, var(--c-inventory-table-corner-backdrop) 24px)" }}
            />
          </div>
        )}
        {loading && <span role="status" className="sr-only">재고 데이터를 불러오는 중입니다...</span>}
        <table aria-busy={loading || undefined} className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className={`sticky ${compact ? "top-0" : "top-[71px]"} z-10`}>
            <tr>
              {headerColumns.map(({ label, nowrap, width, minWidth, center, hidden }, columnIndex) => (
                <th
                  key={label}
                  scope="col"
                  className={`border-b px-4 py-2.5 text-sm font-bold${columnIndex === 0 ? " rounded-tl-[24px]" : ""}${nowrap ? " whitespace-nowrap" : ""}${center ? " text-center" : " text-left"}${hidden ? " hidden sm:table-cell" : ""}`}
                  style={{
                    background: compact ? LEGACY_COLORS.s2 : "var(--c-inventory-table-header)",
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
                className={`border-b px-4 py-2.5 text-sm font-bold whitespace-nowrap ${compact ? "rounded-tr-[24px] text-center" : "text-right sm:text-center"}`}
                style={{ background: compact ? LEGACY_COLORS.s2 : "var(--c-inventory-table-header)", borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width: compact ? "104px" : "160px" }}
              >
                사용 가능 재고
              </th>
              {!compact && (
                <th
                  scope="col"
                  className="hidden rounded-tr-[24px] border-b px-4 py-2.5 text-sm font-bold whitespace-nowrap text-center sm:table-cell"
                  style={{ background: "var(--c-inventory-table-header)", borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width: "160px" }}
                >
                  안전재고
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 8 }, (_, index) => (
              <tr key={index} data-testid="inventory-skeleton-row" aria-hidden="true">
                {Array.from({ length: 7 }, (_, column) => (
                  <td key={column} className={`border-b px-4 py-5 align-middle${column !== 0 && column !== 2 && column !== 5 ? " hidden sm:table-cell" : ""}`} style={{ borderColor: LEGACY_COLORS.border }}>
                    {column === 2 ? <div className="flex h-12 flex-col justify-center gap-3 motion-safe:animate-pulse">
                      <div className="h-4 w-2/3 rounded" style={{ background: LEGACY_COLORS.borderStrong }} />
                      <div className="h-1.5 w-full rounded-full" style={{ background: LEGACY_COLORS.border }} />
                    </div> : <div className={`mx-auto motion-safe:animate-pulse ${column === 1 ? "h-12 w-12 rounded-lg" : column === 0 || column === 4 ? "h-6 w-14 rounded-full" : "h-4 w-12 rounded"}`} style={{ background: LEGACY_COLORS.borderStrong }} />}
                  </td>
                ))}
              </tr>
            )) : chunkedItems.map((item) => (
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
