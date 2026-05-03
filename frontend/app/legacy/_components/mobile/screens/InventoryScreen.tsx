"use client";

import { useMemo, useState } from "react";
import { CheckSquare, PackageSearch } from "lucide-react";
import type { Item } from "@/lib/api";
import { ItemDetailSheet } from "../../ItemDetailSheet";
import { LEGACY_COLORS } from "../../legacyUi";
import { formatQty } from "@/lib/mes/format";
import { ELEVATION, TYPO } from "../tokens";
import { useModels } from "../hooks/useModels";
import { useInventoryListData } from "../../_inventory_hooks/useInventoryListData";
import type { ToastState } from "@/features/mes/shared/Toast";
import {
  AsyncState,
  AsyncSkeletonRows,
  EmptyState,
  ItemRow,
  PrimaryActionButton,
  StickyFooter,
} from "../primitives";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryFilterSheet,
  buildActiveFilterChips,
  countActiveFilters,
  type InventoryFilters,
} from "./InventoryFilterSheet";
import { InventorySelectionBanner } from "./_inventory_parts/InventorySelectionBanner";
import { InventoryStickyHeader } from "./_inventory_parts/InventoryStickyHeader";

export function InventoryScreen({
  showToast,
  onOpenHistory,
  onBulkIO,
}: {
  showToast: (toast: ToastState) => void;
  onOpenHistory: () => void;
  onBulkIO: (items: Item[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_INVENTORY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const { models } = useModels();
  const { items, loading, error, hasMore, loadMore, refetch, rows, totals } =
    useInventoryListData(search, filters);

  const activeFilterCount = countActiveFilters(filters);
  const activeChips = useMemo(
    () => buildActiveFilterChips(filters, setFilters),
    [filters],
  );
  const toggleKpi = (next: InventoryFilters["kpi"]) =>
    setFilters((cur) => ({ ...cur, kpi: cur.kpi === next ? "ALL" : next }));

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const checkedItems = useMemo(
    () => rows.filter((r) => checked.has(r.item.item_id)).map((r) => r.item),
    [rows, checked],
  );
  const exitSelecting = () => {
    setSelecting(false);
    setChecked(new Set());
  };

  const listEmpty = rows.length === 0 && !loading && !error;

  return (
    <div className="relative flex flex-col pb-24">
      {/* Sticky top region — swaps between normal view and selection banner */}
      <div
        className="sticky top-0 z-20"
        style={{
          background: LEGACY_COLORS.bg,
          boxShadow: ELEVATION.sticky,
        }}
      >
        {selecting ? (
          <InventorySelectionBanner
            selectedCount={checkedItems.length}
            onCancel={exitSelecting}
          />
        ) : (
          <InventoryStickyHeader
            search={search}
            setSearch={setSearch}
            onOpenHistory={onOpenHistory}
            onOpenFilter={() => setFilterOpen(true)}
            activeFilterCount={activeFilterCount}
            totalsNormal={totals.normal}
            totalsLow={totals.low}
            totalsZero={totals.zero}
            filters={filters}
            onToggleKpi={toggleKpi}
            activeChips={activeChips}
            setFilters={setFilters}
          />
        )}
      </div>

      {/* List area */}
      <div className="flex flex-col gap-3 px-4 pt-3">
        <div className="flex items-center justify-between px-1">
          <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
            {formatQty(totals.count)}개 품목
          </div>
          {!selecting ? (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              className={`${TYPO.caption} flex items-center gap-1 rounded-[14px] px-2 py-1 font-semibold active:scale-95`}
              style={{ color: LEGACY_COLORS.blue }}
            >
              <CheckSquare size={14} /> 다중선택
            </button>
          ) : (
            <div
              className={`${TYPO.caption} font-semibold tabular-nums`}
              style={{ color: LEGACY_COLORS.blue }}
            >
              {checkedItems.length} / {totals.count}
            </div>
          )}
        </div>

        <AsyncState
          loading={loading && items.length === 0}
          error={error}
          empty={listEmpty}
          onRetry={refetch}
          skeleton={<AsyncSkeletonRows count={5} />}
          emptyView={
            <EmptyState
              icon={PackageSearch}
              title="조건에 맞는 품목이 없습니다"
              description="검색어나 필터를 조정해 보세요."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilters(DEFAULT_INVENTORY_FILTERS);
                  }}
                  className={`${TYPO.body} rounded-[14px] px-4 py-2 font-semibold`}
                  style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
                >
                  필터 초기화
                </button>
              }
            />
          }
        >
          <>
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <ItemRow
                  key={row.key}
                  item={row.item}
                  selected={selecting && checked.has(row.item.item_id)}
                  showCheckbox={selecting}
                  dense={selecting}
                  onClick={() => {
                    if (selecting) toggleCheck(row.item.item_id);
                    else setSelectedItem(row.item);
                  }}
                  right={
                    row.count > 1 ? (
                      <div
                        className={`${TYPO.caption} rounded-full px-2 py-[2px] font-semibold`}
                        style={{
                          background: `${LEGACY_COLORS.cyan as string}22`,
                          color: LEGACY_COLORS.cyan,
                        }}
                      >
                        {row.count}개
                      </div>
                    ) : null
                  }
                />
              ))}
            </div>
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                className={`${TYPO.body} mt-1 rounded-[14px] border py-3 font-semibold`}
                style={{
                  background: LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                }}
              >
                {loading ? "불러오는 중…" : "100개 더 보기"}
              </button>
            ) : null}
          </>
        </AsyncState>
      </div>

      {selecting && checkedItems.length > 0 ? (
        <StickyFooter>
          <PrimaryActionButton
            intent="primary"
            label="일괄 입출고"
            count={checkedItems.length}
            onClick={() => {
              onBulkIO(checkedItems);
              exitSelecting();
            }}
          />
        </StickyFooter>
      ) : null}

      <InventoryFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_INVENTORY_FILTERS)}
        models={models}
      />

      <ItemDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSaved={async (updated) => {
          showToast({ type: "success", message: `${updated.item_name} 재고를 반영했습니다.` });
          refetch();
          setSelectedItem(updated);
        }}
      />
    </div>
  );
}
