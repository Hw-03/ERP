"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

const DESKTOP_PAGE_SIZE = 100;
import { ChevronDown, Filter, PackageSearch, Search, Sparkles, TrendingUp } from "lucide-react";
import { api, type Item, type ProductModel, type TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  LEGACY_COLORS,
  employeeColor,
  erpCodeDept,
  formatNumber,
  getStockState,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

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

type KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO";

export type InventorySummary = {
  total: number;
  low: number;
  zero: number;
  lastUpdatedAt: number | null;
};

function getMinStock(item: Item) {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

function matchesSearch(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.erp_code,
    item.item_name,
    item.spec ?? "",
    item.location ?? "",
    item.supplier ?? "",
    item.legacy_model ?? "",
    item.barcode ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

function safeQty(item: Item) {
  const n = Number(item.quantity);
  return isNaN(n) ? 0 : n;
}

function matchesKpi(item: Item, kpi: KpiFilter) {
  const qty = safeQty(item);
  const min = getMinStock(item);
  if (kpi === "NORMAL") return qty > 0 && qty >= min;
  if (kpi === "LOW") return qty > 0 && qty < min;
  if (kpi === "ZERO") return qty <= 0;
  return true;
}

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
        background: active ? `${tone}22` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
  );
}

// ─────────── 로컬 서브 컴포넌트 ───────────

type KpiCard = { label: string; value: number; hint: string; tone: string; key: KpiFilter };

function CompactKpiBar({
  cards,
  activeKey,
  onChange,
}: {
  cards: KpiCard[];
  activeKey: KpiFilter;
  onChange: (key: KpiFilter) => void;
}) {
  const [hovered, setHovered] = useState<KpiFilter | null>(null);
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {cards.map((card) => {
        const isActive = activeKey === card.key;
        const isHover = hovered === card.key;
        return (
          <button
            key={card.key}
            onClick={() => onChange(card.key)}
            onMouseEnter={() => setHovered(card.key)}
            onMouseLeave={() => setHovered(null)}
            className="rounded-[16px] border px-4 py-4 text-left transition-colors hover:brightness-110"
            style={{
              background: isActive
                ? `color-mix(in srgb, ${card.tone} 22%, transparent)`
                : isHover
                ? `color-mix(in srgb, ${card.tone} 16%, transparent)`
                : `color-mix(in srgb, ${card.tone} 8%, transparent)`,
              borderColor: isActive || isHover
                ? card.tone
                : `color-mix(in srgb, ${card.tone} 35%, transparent)`,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
                {card.label}
              </div>
              <div className="font-mono text-[22px] font-black leading-none" style={{ color: card.tone }}>
                {formatNumber(card.value)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function InventoryFilters({
  open,
  selectedDepts,
  selectedModels,
  productModels,
  toggleDept,
  toggleModel,
  onClearDepts,
  onClearModels,
}: {
  open: boolean;
  selectedDepts: string[];
  selectedModels: string[];
  productModels: ProductModel[];
  toggleDept: (v: string) => void;
  toggleModel: (v: string) => void;
  onClearDepts: () => void;
  onClearModels: () => void;
}) {
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
            <Chip key={opt.value} active={selectedDepts.includes(opt.value)} label={opt.label} onClick={() => toggleDept(opt.value)} tone={LEGACY_COLORS.green} />
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
            <Chip key={m.model_name} active={selectedModels.includes(m.model_name ?? "")} label={m.model_name ?? ""} onClick={() => toggleModel(m.model_name ?? "")} tone={LEGACY_COLORS.cyan} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TableStickyHeader({
  searchValue,
  onSearchChange,
  count,
  activeFilterCount,
  filtersOpen,
  onToggleFilters,
}: {
  searchValue: string;
  onSearchChange: (v: string) => void;
  count: number;
  activeFilterCount: number;
  filtersOpen: boolean;
  onToggleFilters: () => void;
}) {
  return (
    <div
      className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 rounded-t-[28px]"
      style={{
        background: LEGACY_COLORS.bg,
        backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))",
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3 pt-5">
        <div className="shrink-0 text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
          자재 목록
        </div>
        <div
          className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[14px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="품목명, 코드, 위치, 공급처 검색"
            className="flex-1 bg-transparent text-base outline-none"
            style={{ color: LEGACY_COLORS.text }}
          />
          <span className="shrink-0 font-mono text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {formatNumber(count)}
          </span>
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

function RightPanelBody({
  item,
  logs,
  onGoToWarehouse,
}: {
  item: Item;
  logs: TransactionLog[];
  onGoToWarehouse: (item: Item) => void;
}) {
  return (
    <div className="space-y-4">
      {/* 품목 정보 */}
      <section
        className="rounded-[28px] border p-5"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          품목 정보
        </div>
        <div className="grid gap-3 text-base">
          {item.erp_code && (
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                ERP 코드
              </div>
              <div className="mt-1 font-mono text-base font-bold" style={{ color: LEGACY_COLORS.blue }}>
                {item.erp_code}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                현재고
              </div>
              <div className="mt-1 font-mono text-xl font-black">{formatNumber(item.quantity)}</div>
            </div>
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                안전재고
              </div>
              <div className="mt-1 font-mono text-xl font-black">
                {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
              </div>
            </div>
          </div>
          <div
            className="rounded-[18px] border px-4 py-3"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              모델
            </div>
            <div className="mt-1 text-base">{normalizeModel(item.legacy_model)}</div>
          </div>
          {(item.unit || item.supplier) && (
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-[18px] border px-4 py-3"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  단위
                </div>
                <div className="mt-1 text-base">{item.unit || "-"}</div>
              </div>
              <div
                className="rounded-[18px] border px-4 py-3"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  공급처
                </div>
                <div className="mt-1 text-sm truncate">{item.supplier || "-"}</div>
              </div>
            </div>
          )}
          {item.spec && (
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                스펙
              </div>
              <div className="mt-1 text-base">{item.spec}</div>
            </div>
          )}
        </div>
      </section>

      {/* 위치별 재고 */}
      {(Number(item.warehouse_qty) > 0 || (item.locations ?? []).some((l) => Number(l.quantity) > 0)) && (
        <section
          className="rounded-[28px] border p-5"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
        >
          <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
            위치별 재고
          </div>
          <div className="space-y-2">
            {Number(item.warehouse_qty) > 0 && (
              <div
                className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.muted2 }} />
                <span className="flex-1 text-base font-semibold">창고</span>
                <span className="font-mono text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                  {formatNumber(item.warehouse_qty)}
                </span>
              </div>
            )}
            {(item.locations ?? [])
              .filter((l) => Number(l.quantity) > 0)
              .map((l) => (
                <div
                  key={l.department}
                  className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: employeeColor(l.department) }} />
                  <span className="flex-1 text-base font-semibold">{l.department}</span>
                  <span className="font-mono text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {formatNumber(l.quantity)}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 빠른 작업 */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          빠른 작업
        </div>
        <button
          onClick={() => onGoToWarehouse(item)}
          className="w-full rounded-[18px] px-4 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: LEGACY_COLORS.blue }}
        >
          입출고 진행
        </button>
      </div>

      {/* 최근 이력 */}
      <section
        className="rounded-[28px] border p-5"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          최근 이력
        </div>
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              최근 거래 이력이 없습니다.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.log_id}
                className="rounded-[18px] border p-3"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                    {transactionLabel(log.transaction_type)}
                  </span>
                  <span className="font-mono text-sm">{formatNumber(log.quantity_change)}</span>
                </div>
                <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {log.notes || "메모 없음"}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

// ─────────── 메인 ───────────

export function DesktopInventoryView({
  globalSearch,
  onStatusChange,
  onGoToWarehouse,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onGoToWarehouse: (item: Item) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemLogs, setItemLogs] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [localSearch, setLocalSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(DESKTOP_PAGE_SIZE);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);
      const nextItems = await api.getItems({
        limit: 2000,
        search: globalSearch.trim() || undefined,
      });
      setItems(nextItems);
      onStatusChange(`재고 ${nextItems.length}건을 불러왔습니다.`);
      setSelectedItem((current) => (current ? nextItems.find((item) => item.item_id === current.item_id) ?? null : null));
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "재고 데이터를 불러오지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setLoading(false);
    }
  }

  function toggleDept(v: string) {
    setSelectedDepts((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]));
    setDisplayLimit(DESKTOP_PAGE_SIZE);
  }
  function toggleModel(v: string) {
    setSelectedModels((prev) => (prev.includes(v) ? prev.filter((m) => m !== v) : [...prev, v]));
    setDisplayLimit(DESKTOP_PAGE_SIZE);
  }

  useEffect(() => {
    void api.getModels().then(setProductModels).catch(() => {});
  }, []);

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearch]);

  useEffect(() => {
    if (!selectedItem) {
      setItemLogs([]);
      return;
    }
    void api
      .getTransactions({ itemId: selectedItem.item_id, limit: 10 })
      .then(setItemLogs)
      .catch(() => setItemLogs([]));
  }, [selectedItem]);

  const selectedSlots = useMemo(
    () => new Set(productModels.filter((m) => selectedModels.includes(m.model_name ?? "")).map((m) => m.slot)),
    [productModels, selectedModels],
  );

  const scopedItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesSearch(item, deferredLocalSearch)) return false;
        if (selectedDepts.length > 0) {
          const inDept = selectedDepts.some((d) =>
            d === "창고"
              ? (item.warehouse_qty ?? 0) > 0
              : item.department === d ||
                erpCodeDept(item.erp_code) === d ||
                item.locations.some((loc) => loc.department === d),
          );
          if (!inDept) return false;
        }
        if (selectedSlots.size > 0 && !item.model_slots.some((s) => selectedSlots.has(s))) return false;
        return true;
      }),
    [items, deferredLocalSearch, selectedDepts, selectedSlots],
  );
  const filteredItems = useMemo(() => scopedItems.filter((item) => matchesKpi(item, kpi)), [scopedItems, kpi]);

  useEffect(() => {
    setDisplayLimit(DESKTOP_PAGE_SIZE);
  }, [filteredItems]);

  const summary = useMemo(() => {
    const totalQuantity = scopedItems.reduce((acc, item) => acc + safeQty(item), 0);
    const normalCount = scopedItems.filter((item) => safeQty(item) > 0 && safeQty(item) >= getMinStock(item)).length;
    const lowCount = scopedItems.filter((item) => safeQty(item) > 0 && safeQty(item) < getMinStock(item)).length;
    const zeroCount = scopedItems.filter((item) => safeQty(item) <= 0).length;
    return { totalCount: scopedItems.length, totalQuantity, normalCount, lowCount, zeroCount };
  }, [scopedItems]);

  const isFiltered = selectedDepts.length > 0 || selectedModels.length > 0 || deferredLocalSearch.length > 0;
  const activeFilterCount =
    selectedDepts.length + selectedModels.length + (deferredLocalSearch.length > 0 ? 1 : 0);

  const kpiCards: KpiCard[] = [
    {
      label: isFiltered ? "조회 품목" : "전체 품목",
      value: filteredItems.length,
      hint: isFiltered ? `전체 ${items.length}건 중 필터 적용` : `총 재고 ${formatNumber(summary.totalQuantity)}`,
      tone: LEGACY_COLORS.blue,
      key: "ALL",
    },
    { label: "정상", value: summary.normalCount, hint: "운영 가능", tone: LEGACY_COLORS.green, key: "NORMAL" },
    { label: "부족", value: summary.lowCount, hint: "안전재고 이하", tone: LEGACY_COLORS.yellow, key: "LOW" },
    { label: "품절", value: summary.zeroCount, hint: "즉시 확인", tone: LEGACY_COLORS.red, key: "ZERO" },
  ];

  const headerBadge = selectedItem
    ? (() => {
        const stock = getStockState(
          Number(selectedItem.quantity),
          selectedItem.min_stock == null ? null : Number(selectedItem.min_stock),
        );
        return (
          <span
            className="inline-flex rounded-full px-3 py-1 text-sm font-bold"
            style={{ color: stock.color, background: `${stock.color}20` }}
          >
            {stock.label}
          </span>
        );
      })()
    : null;

  return (
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4">
        {/* ── 좌측: 스크롤 컨테이너 ── */}
        <div
          ref={scrollRef}
          className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}
        >
          <div className="flex flex-col gap-3 pb-6">
            {/* ── 컴팩트 상단: KPI + 생산가능 + (접힘형) 필터 ── */}
            <section className="card" style={{ padding: "14px 16px" }}>
              <CompactKpiBar cards={kpiCards} activeKey={kpi} onChange={setKpi} />
              <InventoryFilters
                open={filtersOpen}
                selectedDepts={selectedDepts}
                selectedModels={selectedModels}
                productModels={productModels}
                toggleDept={toggleDept}
                toggleModel={toggleModel}
                onClearDepts={() => setSelectedDepts([])}
                onClearModels={() => setSelectedModels([])}
              />
            </section>

            {/* ── 재고 테이블 ── */}
            <section
              className="card"
              style={{ backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))" }}
            >
              <TableStickyHeader
                searchValue={localSearch}
                onSearchChange={setLocalSearch}
                count={filteredItems.length}
                activeFilterCount={activeFilterCount}
                filtersOpen={filtersOpen}
                onToggleFilters={() => setFiltersOpen((prev) => !prev)}
              />

              {error ? (
                <div
                  className="rounded-[24px] border px-4 py-4 text-base"
                  style={{
                    borderColor: "rgba(255,123,123,.26)",
                    background: "rgba(255,123,123,.08)",
                    color: LEGACY_COLORS.red,
                  }}
                >
                  {error}
                </div>
              ) : loading ? (
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
              ) : (
                <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr style={{ background: LEGACY_COLORS.s2 }}>
                        {(
                          [
                            { label: "상태", nowrap: true, width: "80px" },
                            { label: "품목명", nowrap: false, minWidth: "180px" },
                            { label: "ERP코드", nowrap: true, width: "100px" },
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
                      {filteredItems.slice(0, displayLimit).map((item) => {
                        const minStock = getMinStock(item);
                        const stock = getStockState(safeQty(item), minStock === 0 ? null : minStock);
                        const selected = selectedItem?.item_id === item.item_id;
                        const qty = safeQty(item);
                        const isCritical = qty <= 0 || (minStock > 0 && qty < minStock);
                        return (
                          <tr
                            key={item.item_id}
                            onClick={() =>
                              setSelectedItem((current) => (current?.item_id === item.item_id ? null : item))
                            }
                            className="cursor-pointer transition-colors hover:bg-white/[0.12]"
                            style={{
                              background: selected ? "rgba(101,169,255,.10)" : "transparent",
                              boxShadow: selected ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
                            }}
                          >
                            <td
                              className="border-b px-4 py-2.5 align-middle whitespace-nowrap"
                              style={{ borderColor: LEGACY_COLORS.border }}
                            >
                              <span
                                className="inline-flex w-fit rounded-full px-2.5 py-1 text-sm font-bold"
                                style={{ color: stock.color, background: `${stock.color}20` }}
                              >
                                {stock.label}
                              </span>
                            </td>
                            <td
                              className="border-b px-4 py-2.5 align-middle"
                              style={{ borderColor: LEGACY_COLORS.border }}
                            >
                              <div className="font-semibold">{item.item_name}</div>
                              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                                {item.spec || "-"}
                              </div>
                              {(() => {
                                if (Number(item.quantity) === 0) {
                                  return (
                                    <div
                                      className="mt-2 h-[5px] overflow-hidden rounded-full"
                                      style={{ background: "#ef4444" }}
                                      title="품절"
                                    />
                                  );
                                }
                                const total = Math.max(Number(item.quantity), 1);
                                const wh = Number(item.warehouse_qty);
                                const depts = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
                                const segments: { pct: number; color: string; label: string }[] = [];
                                let used = 0;
                                if (wh > 0) {
                                  const pct = Math.min(100, (wh / total) * 100);
                                  segments.push({ pct, color: "#3ac4b0", label: `창고 ${formatNumber(wh)}` });
                                  used += pct;
                                }
                                for (const loc of depts) {
                                  const pct = Math.min(100 - used, (Number(loc.quantity) / total) * 100);
                                  if (pct <= 0) break;
                                  segments.push({
                                    pct,
                                    color: employeeColor(loc.department),
                                    label: `${loc.department} ${formatNumber(loc.quantity)}`,
                                  });
                                  used += pct;
                                }
                                return (
                                  <div
                                    className="mt-2 flex h-[5px] overflow-hidden rounded-full"
                                    style={{ background: LEGACY_COLORS.s3 }}
                                    title={segments.map((s) => s.label).join(" / ")}
                                  >
                                    {segments.map((s, i) => (
                                      <div
                                        key={i}
                                        className="h-full shrink-0"
                                        style={{ width: `${s.pct}%`, background: s.color }}
                                      />
                                    ))}
                                  </div>
                                );
                              })()}
                            </td>
                            <td
                              className="border-b px-4 py-2.5 align-middle whitespace-nowrap font-mono text-sm font-bold"
                              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                            >
                              {item.erp_code ?? "-"}
                            </td>
                            <td
                              className="border-b px-4 py-2.5 align-middle whitespace-nowrap"
                              style={{ borderColor: LEGACY_COLORS.border }}
                            >
                              {(() => {
                                const badges: { key: string; label: string; color: string; dim?: boolean }[] = [];
                                if (Number(item.warehouse_qty) > 0)
                                  badges.push({ key: "창고", label: "창고", color: "#3dd4a0" });
                                for (const l of item.locations.filter((l) => Number(l.quantity) > 0))
                                  badges.push({ key: l.department, label: l.department, color: employeeColor(l.department) });
                                if (badges.length === 0) {
                                  const dept = item.department ?? erpCodeDept(item.erp_code);
                                  if (dept) badges.push({ key: dept, label: dept, color: employeeColor(dept), dim: true });
                                }
                                const visible = badges.slice(0, 2);
                                const extra = badges.length - 2;
                                return (
                                  <div className="flex items-center gap-1.5">
                                    {visible.map((b) => (
                                      <span
                                        key={b.key}
                                        className={`text-sm font-bold${b.dim ? " opacity-50" : ""}`}
                                        style={{ color: b.color }}
                                      >
                                        {b.label}
                                      </span>
                                    ))}
                                    {extra > 0 && (
                                      <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                                        +{extra}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td
                              className="border-b px-4 py-2.5 text-center align-middle whitespace-nowrap font-mono text-base font-black"
                              style={{
                                borderColor: LEGACY_COLORS.border,
                                color: isCritical ? stock.color : LEGACY_COLORS.text,
                              }}
                            >
                              {formatNumber(item.quantity)}
                            </td>
                            <td
                              className="border-b px-4 py-2.5 text-center align-middle whitespace-nowrap font-mono text-sm"
                              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                            >
                              {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredItems.length > displayLimit && (
                <button
                  onClick={() => setDisplayLimit((prev) => prev + DESKTOP_PAGE_SIZE)}
                  className="mt-4 w-full rounded-[24px] border py-4 text-base font-semibold"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  100개 더 보기 (
                  {formatNumber(Math.min(displayLimit + DESKTOP_PAGE_SIZE, filteredItems.length))} /{" "}
                  {formatNumber(filteredItems.length)})
                </button>
              )}
              {filteredItems.length > 0 && (
                <div className="mt-2 text-center text-xs" style={{ color: LEGACY_COLORS.muted }}>
                  {formatNumber(Math.min(displayLimit, filteredItems.length))} / {formatNumber(filteredItems.length)}개 표시
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ── 우측: 품목 상세 패널 ── */}
        <DesktopRightPanel
          title={selectedItem ? selectedItem.item_name : "품목을 선택해 주세요"}
          subtitle={selectedItem ? `${selectedItem.erp_code} · ${selectedItem.legacy_part ?? "-"}` : undefined}
          headerBadge={headerBadge}
        >
          {!selectedItem ? (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 rounded-[28px] border p-8 text-center"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div
                className="rounded-3xl p-5"
                style={{ background: "rgba(101,169,255,.12)", color: LEGACY_COLORS.blue }}
              >
                <PackageSearch className="h-7 w-7" />
              </div>
              <div className="text-base font-bold">선택된 품목이 없습니다.</div>
              <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
                목록에서 품목을 선택하세요.
              </div>
            </div>
          ) : (
            <RightPanelBody item={selectedItem} logs={itemLogs} onGoToWarehouse={onGoToWarehouse} />
          )}
        </DesktopRightPanel>
      </div>
  );
}
