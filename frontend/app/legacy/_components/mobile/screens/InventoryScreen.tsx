"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { CheckSquare, Filter, History, PackageSearch, X } from "lucide-react";
import type { Item } from "@/lib/api";
import { ItemDetailSheet } from "../../ItemDetailSheet";
import { LEGACY_COLORS, formatNumber, getStockState } from "../../legacyUi";
import { TYPO } from "../tokens";
import { useItems } from "../hooks/useItems";
import { useModels } from "../hooks/useModels";
import type { ToastState } from "../../Toast";
import {
  EmptyState,
  IconButton,
  InlineSearch,
  ItemRow,
  KpiCard,
  StickyFooter,
} from "../primitives";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryFilterSheet,
  countActiveFilters,
  type InventoryFilters,
} from "./InventoryFilterSheet";

const SEMI_CATS = new Set(["TA", "HA", "VA", "BA"]);
const FIXED_CATS = new Set(["TF", "HF", "VF", "AF"]);

type DisplayRow = { key: string; item: Item; quantity: number; available: number; count: number };
type KpiKey = "ALL" | "OK" | "LOW" | "ZERO";

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
  const [kpi, setKpi] = useState<KpiKey>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const deferredSearch = useDeferredValue(search);
  const models = useModels();

  const { items, loading, error, hasMore, loadMore, refetch } = useItems({
    search: deferredSearch,
    department: filters.department,
    legacyModel: filters.legacyModel,
  });

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const avail = Number(item.available_quantity ?? item.quantity);
      const min = item.min_stock == null ? null : Number(item.min_stock);
      if (kpi === "OK" && !(avail > 0 && !(min != null && avail < min))) return false;
      if (kpi === "LOW" && !(avail > 0 && min != null && avail < min)) return false;
      if (kpi === "ZERO" && !(avail <= 0)) return false;
      if (filters.itemType === "RM" && item.category !== "RM") return false;
      if (filters.itemType === "SEMI" && !SEMI_CATS.has(item.category ?? "")) return false;
      if (filters.itemType === "FIXED" && !FIXED_CATS.has(item.category ?? "")) return false;
      if (filters.itemType === "FG" && item.category !== "FG") return false;
      return true;
    });
  }, [items, kpi, filters.itemType]);

  const rows: DisplayRow[] = useMemo(() => {
    if (!filters.grouped) {
      return filtered.map((item) => ({
        key: item.item_id,
        item,
        quantity: Number(item.quantity),
        available: Number(item.available_quantity ?? item.quantity),
        count: 1,
      }));
    }
    const map = new Map<string, DisplayRow>();
    filtered.forEach((item) => {
      const key = item.item_name.trim().toLowerCase();
      const q = Number(item.quantity);
      const a = Number(item.available_quantity ?? item.quantity);
      const prev = map.get(key);
      if (prev) {
        prev.quantity += q;
        prev.available += a;
        prev.count += 1;
      } else {
        map.set(key, { key, item, quantity: q, available: a, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [filtered, filters.grouped]);

  const totals = useMemo(() => {
    const normal = rows.filter((r) => {
      const min = r.item.min_stock == null ? null : Number(r.item.min_stock);
      return getStockState(r.available, min).label === "정상";
    }).length;
    const low = rows.filter((r) => {
      const min = r.item.min_stock == null ? null : Number(r.item.min_stock);
      return getStockState(r.available, min).label === "부족";
    }).length;
    const zero = rows.filter((r) => r.available <= 0).length;
    return { count: rows.length, normal, low, zero };
  }, [rows]);

  const activeFilterCount = countActiveFilters(filters) + (kpi !== "ALL" ? 1 : 0);
  const toggleKpi = (next: KpiKey) => setKpi((cur) => (cur === next ? "ALL" : next));

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

  return (
    <div className="flex flex-col gap-3 px-4 pb-24 pt-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <InlineSearch value={search} onChange={setSearch} placeholder="품명 · 코드 · 모델 · 공급처" />
        </div>
        <IconButton
          icon={History}
          label="이력"
          size="md"
          onClick={onOpenHistory}
          color={LEGACY_COLORS.muted2}
        />
        <IconButton
          icon={Filter}
          label="필터"
          size="md"
          onClick={() => setFilterOpen(true)}
          color={activeFilterCount > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2}
          badge={activeFilterCount}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <KpiCard
          label="정상"
          value={totals.normal}
          color={LEGACY_COLORS.green}
          active={kpi === "OK"}
          onClick={() => toggleKpi("OK")}
        />
        <KpiCard
          label="부족"
          value={totals.low}
          color={LEGACY_COLORS.yellow}
          active={kpi === "LOW"}
          onClick={() => toggleKpi("LOW")}
        />
        <KpiCard
          label="품절"
          value={totals.zero}
          color={LEGACY_COLORS.red}
          active={kpi === "ZERO"}
          onClick={() => toggleKpi("ZERO")}
        />
      </div>

      <div className="flex items-center justify-between px-1">
        <div className={`${TYPO.caption} font-mono`} style={{ color: LEGACY_COLORS.muted2 }}>
          {formatNumber(totals.count)}개 품목
        </div>
        <button
          type="button"
          onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
          className={`${TYPO.caption} flex items-center gap-1 rounded-[14px] px-2 py-1 font-semibold`}
          style={{ color: selecting ? LEGACY_COLORS.red : LEGACY_COLORS.blue }}
        >
          {selecting ? (
            <>
              <X size={14} /> 선택 취소
            </>
          ) : (
            <>
              <CheckSquare size={14} /> 다중선택
            </>
          )}
        </button>
      </div>

      {error ? (
        <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.red }}>
          {error}
        </div>
      ) : loading && items.length === 0 ? (
        <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
          불러오는 중…
        </div>
      ) : rows.length === 0 ? (
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
                setKpi("ALL");
              }}
              className={`${TYPO.body} rounded-[14px] px-4 py-2 font-semibold`}
              style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
            >
              필터 초기화
            </button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <ItemRow
                key={row.key}
                item={row.item}
                selected={selecting && checked.has(row.item.item_id)}
                onClick={() => {
                  if (selecting) toggleCheck(row.item.item_id);
                  else setSelectedItem(row.item);
                }}
                right={
                  row.count > 1 ? (
                    <div
                      className={`${TYPO.caption} rounded-full px-2 py-[2px] font-semibold`}
                      style={{ background: `${LEGACY_COLORS.cyan as string}22`, color: LEGACY_COLORS.cyan }}
                    >
                      {row.count}개 묶음
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
      )}

      {selecting && checkedItems.length > 0 ? (
        <StickyFooter>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className={`${TYPO.caption} font-semibold`} style={{ color: LEGACY_COLORS.muted2 }}>
                선택됨
              </div>
              <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {checkedItems.length}건
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onBulkIO(checkedItems);
                exitSelecting();
              }}
              className={`${TYPO.body} flex-1 rounded-[14px] py-3 font-black`}
              style={{ background: LEGACY_COLORS.blue, color: "#fff" }}
            >
              일괄 입출고
            </button>
          </div>
        </StickyFooter>
      ) : null}

      <InventoryFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => {
          setFilters(DEFAULT_INVENTORY_FILTERS);
          setKpi("ALL");
        }}
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
