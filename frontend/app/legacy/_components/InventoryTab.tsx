"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, type Item, type ProductModel } from "@/lib/api";
import { FilterPills } from "./FilterPills";
import { ItemDetailSheet } from "./ItemDetailSheet";
import type { ToastState } from "./Toast";
import {
  LEGACY_COLORS,
  erpCodeDeptBadge,
  formatNumber,
  getStockState,
  normalizeModel,
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
];

const STATIC_MODEL_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "공용", value: "공용" },
];

const KPI_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "정상", value: "OK" },
  { label: "부족", value: "LOW" },
  { label: "품절", value: "ZERO" },
];

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "RM(원자재)", value: "RM" },
  { label: "반제품(?A)", value: "SEMI" },
  { label: "고정형(?F)", value: "FIXED" },
  { label: "완제품(FG)", value: "FG" },
];

const SEMI_CATS = new Set(["TA", "HA", "VA", "BA"]);
const FIXED_CATS = new Set(["TF", "HF", "VF", "AF"]);

const PAGE_SIZE = 100;

type DisplayRow = {
  key: string;
  representative: Item;
  quantity: number;
  warehouse: number;
  production: number;
  defective: number;
  pending: number;
  available: number;
  reserver: string | null;
  count: number;
};

export function InventoryTab({
  showToast,
  onOpenHistory,
}: {
  showToast: (toast: ToastState) => void;
  onOpenHistory: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("ALL");
  const [model, setModel] = useState("ALL");
  const [kpi, setKpi] = useState("ALL");
  const [itemType, setItemType] = useState("ALL");
  const [grouped, setGrouped] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const modelOptions = useMemo(() => [
    ...STATIC_MODEL_OPTIONS,
    ...productModels.map((m) => ({ label: m.model_name ?? "", value: m.model_name ?? "" })),
  ], [productModels]);

  const deferredSearch = useDeferredValue(search);

  async function fetchItems(skip = 0, append = false) {
    try {
      setLoading(true);
      const params: Parameters<typeof api.getItems>[0] = {
        limit: PAGE_SIZE,
        skip,
      };
      if (dept !== "ALL") params.department = dept;
      if (model !== "ALL") params.legacyModel = model;
      if (deferredSearch.trim()) params.search = deferredSearch.trim();

      const data = await api.getItems(params);
      setItems((current) => (append ? [...current, ...data] : data));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "품목을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void api.getModels().then(setProductModels).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    void fetchItems(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept, model, deferredSearch]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const avail = Number(item.available_quantity ?? item.quantity);
      const min = item.min_stock == null ? null : Number(item.min_stock);
      if (kpi === "OK" && !(avail > 0 && !(min != null && avail < min))) return false;
      if (kpi === "LOW" && !(avail > 0 && min != null && avail < min)) return false;
      if (kpi === "ZERO" && !(avail <= 0)) return false;
      if (itemType === "RM" && item.category !== "RM") return false;
      if (itemType === "SEMI" && !SEMI_CATS.has(item.category ?? "")) return false;
      if (itemType === "FIXED" && !FIXED_CATS.has(item.category ?? "")) return false;
      if (itemType === "FG" && item.category !== "FG") return false;
      return true;
    });
  }, [items, kpi, itemType]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (!grouped) {
      return filtered.map((item) => {
        const quantity = Number(item.quantity);
        const warehouse = Number(item.warehouse_qty ?? 0);
        const production = Number(item.production_total ?? 0);
        const defective = Number(item.defective_total ?? 0);
        const pending = Number(item.pending_quantity ?? 0);
        const available = Number(item.available_quantity ?? warehouse + production - pending);
        return {
          key: item.item_id,
          representative: item,
          quantity,
          warehouse,
          production,
          defective,
          pending,
          available,
          reserver: item.last_reserver_name,
          count: 1,
        };
      });
    }

    const groupedMap = new Map<string, DisplayRow>();
    filtered.forEach((item) => {
      const quantity = Number(item.quantity);
      const warehouse = Number(item.warehouse_qty ?? 0);
      const production = Number(item.production_total ?? 0);
      const defective = Number(item.defective_total ?? 0);
      const pending = Number(item.pending_quantity ?? 0);
      const available = Number(item.available_quantity ?? warehouse + production - pending);
      const key = item.item_name.trim().toLowerCase();
      const existing = groupedMap.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.warehouse += warehouse;
        existing.production += production;
        existing.defective += defective;
        existing.pending += pending;
        existing.available += available;
        existing.count += 1;
      } else {
        groupedMap.set(key, {
          key,
          representative: item,
          quantity,
          warehouse,
          production,
          defective,
          pending,
          available,
          reserver: item.last_reserver_name,
          count: 1,
        });
      }
    });
    return Array.from(groupedMap.values());
  }, [filtered, grouped]);

  const totals = useMemo(() => {
    const totalQuantity = displayRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalPending = displayRows.reduce((sum, row) => sum + row.pending, 0);
    const normalCount = displayRows.filter((row) => {
      const min = row.representative.min_stock == null ? null : Number(row.representative.min_stock);
      return getStockState(row.available, min).label === "정상";
    }).length;
    const lowCount = displayRows.filter((row) => {
      const min = row.representative.min_stock == null ? null : Number(row.representative.min_stock);
      return getStockState(row.available, min).label === "부족";
    }).length;
    const zeroCount = displayRows.filter((row) => row.available <= 0).length;
    return { totalQuantity, totalPending, normalCount, lowCount, zeroCount };
  }, [displayRows]);

  const canLoadMore = items.length >= page * PAGE_SIZE;

  return (
    <div className="pb-4">
      <button
        onClick={onOpenHistory}
        className="mb-[10px] flex w-full items-center justify-center rounded-xl border px-4 py-[13px] text-[15px] font-bold transition-all hover:brightness-110"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.muted2,
        }}
      >
        입출고 이력 확인
      </button>

      <div className="mb-[10px] flex items-center gap-2 rounded-[11px] border px-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <span>🔎</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="품목명, 모델, 공급처, 코드 검색"
          className="w-full bg-transparent py-[10px] text-sm outline-none"
          style={{ color: LEGACY_COLORS.text }}
        />
      </div>

      <FilterPills options={DEPT_OPTIONS} value={dept} onChange={setDept} activeColor={LEGACY_COLORS.green} />
      <FilterPills options={modelOptions} value={model} onChange={setModel} activeColor={LEGACY_COLORS.cyan} />
      <FilterPills options={TYPE_OPTIONS} value={itemType} onChange={setItemType} activeColor={LEGACY_COLORS.purple} />

      <div className="mb-[10px] grid grid-cols-4 gap-2">
        {[
          { label: "전체 품목", value: displayRows.length, color: LEGACY_COLORS.blue },
          { label: "정상", value: totals.normalCount, color: LEGACY_COLORS.green },
          { label: "부족", value: totals.lowCount, color: LEGACY_COLORS.yellow },
          { label: "품절", value: totals.zeroCount, color: LEGACY_COLORS.red },
        ].map((card) => (
          <button
            key={card.label}
            onClick={() => {
              if (card.label === "전체 품목") setKpi("ALL");
              if (card.label === "정상") setKpi("OK");
              if (card.label === "부족") setKpi("LOW");
              if (card.label === "품절") setKpi("ZERO");
            }}
            className="relative overflow-hidden rounded-xl border px-2 py-[10px] text-left transition-all hover:brightness-110"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="mb-1 text-[8px] font-bold uppercase tracking-[0.8px]" style={{ color: LEGACY_COLORS.muted }}>
              {card.label}
            </div>
            <div className="font-mono text-lg font-bold" style={{ color: card.color }}>
              {formatNumber(card.value)}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: card.color }} />
          </button>
        ))}
      </div>

      <div className="mb-[6px] flex items-center justify-between px-[2px]">
        <div className="text-[10px] font-mono" style={{ color: LEGACY_COLORS.muted2 }}>
          {displayRows.length}개 품목 / 총 재고 {formatNumber(totals.totalQuantity)}
        </div>
        <div className="flex items-center gap-2">
          <FilterPills options={KPI_OPTIONS} value={kpi} onChange={setKpi} activeColor={LEGACY_COLORS.purple} />
          <button
            onClick={() => setGrouped((current) => !current)}
            className="rounded-full border px-[11px] py-1 text-[10px] font-semibold transition-all hover:brightness-110"
            style={{
              background: grouped ? LEGACY_COLORS.yellow : LEGACY_COLORS.s2,
              borderColor: grouped ? LEGACY_COLORS.yellow : LEGACY_COLORS.border,
              color: grouped ? "#111" : LEGACY_COLORS.muted2,
            }}
          >
            묶음 보기
          </button>
        </div>
      </div>

      {error ? (
        <div className="py-6 text-center text-sm" style={{ color: LEGACY_COLORS.red }}>
          {error}
        </div>
      ) : loading && items.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          데이터를 불러오는 중입니다...
        </div>
      ) : displayRows.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          조건에 맞는 품목이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          {displayRows.map((row, index) => {
            const item = row.representative;
            const stockState = getStockState(
              row.available,
              item.min_stock == null ? null : Number(item.min_stock),
            );
            const deptBadge = erpCodeDeptBadge(item.erp_code);

            return (
              <button
                key={row.key}
                onClick={() => setSelectedItem(item)}
                className="flex w-full items-center gap-[10px] px-[14px] py-3 text-left transition-colors hover:bg-white/[0.12]"
                style={{
                  borderBottom: index === displayRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-[6px]">
                    <span
                      className="inline-flex rounded-full px-[7px] py-[2px] text-[9px] font-bold"
                      style={{
                        background:
                          stockState.label === "정상"
                            ? "rgba(31,209,122,.15)"
                            : stockState.label === "부족"
                              ? "rgba(244,185,66,.15)"
                              : "rgba(242,95,92,.15)",
                        color: stockState.color,
                      }}
                    >
                      {stockState.label}
                    </span>
                    {deptBadge && (
                      <span
                        className="inline-flex rounded-full px-[7px] py-[2px] text-[9px] font-bold"
                        style={{ background: deptBadge.bg, color: deptBadge.color }}
                      >
                        {deptBadge.label}
                      </span>
                    )}
                    {row.count > 1 ? (
                      <span
                        className="inline-flex rounded-full px-[7px] py-[2px] text-[9px] font-bold"
                        style={{ background: "rgba(6,182,212,.15)", color: LEGACY_COLORS.cyan }}
                      >
                        {row.count}개 품목 묶음
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="truncate text-sm font-semibold">{item.item_name}</div>
                    {item.erp_code && (
                      <span className="shrink-0 font-mono text-[10px] font-black" style={{ color: LEGACY_COLORS.blue }}>
                        {item.erp_code}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {item.erp_code}
                    {item.legacy_part ? ` / ${item.legacy_part}` : ""}
                    {normalizeModel(item.legacy_model) !== "공용" ? ` / ${normalizeModel(item.legacy_model)}` : ""}
                    {item.location ? ` · 📍${item.location}` : ""}
                  </div>
                  {(() => {
                    if (row.quantity === 0) {
                      return (
                        <div className="mt-2 h-[6px] overflow-hidden rounded-full" style={{ background: "#ef4444" }} title="품절" />
                      );
                    }
                    const totalForGauge = Math.max(row.quantity, row.available, 1);
                    const whPct = Math.min(100, (row.warehouse / totalForGauge) * 100);
                    const prodPct = Math.min(100 - whPct, (row.production / totalForGauge) * 100);
                    const defPct = Math.min(100 - whPct - prodPct, (row.defective / totalForGauge) * 100);
                    return (
                      <div
                        className="mt-2 flex h-[6px] overflow-hidden rounded-full"
                        style={{ background: LEGACY_COLORS.s3 }}
                        title={`창고 ${formatNumber(row.warehouse)} / 부서 ${formatNumber(row.production)}${row.defective > 0 ? ` / 불량 ${formatNumber(row.defective)}` : ""}`}
                      >
                        {whPct > 0 && (
                          <div className="h-full shrink-0" style={{ width: `${whPct}%`, background: "var(--c-blue)" }} />
                        )}
                        {prodPct > 0 && (
                          <div className="h-full shrink-0" style={{ width: `${prodPct}%`, background: "var(--c-green)" }} />
                        )}
                        {defPct > 0 && (
                          <div className="h-full shrink-0" style={{ width: `${defPct}%`, background: "var(--c-red)" }} />
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {formatNumber(row.available)}
                  </div>
                  <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {item.unit}
                    {row.pending > 0 ? ` · 예약 ${formatNumber(row.pending)}` : ""}
                    {item.min_stock != null ? ` / 안전 ${formatNumber(item.min_stock)}` : ""}
                  </div>
                  <div className="mt-1 flex justify-end gap-1">
                    <span
                      className="inline-flex rounded-full px-[6px] py-[1px] text-[9px] font-semibold"
                      style={{ background: "rgba(101,169,255,.15)", color: LEGACY_COLORS.blue }}
                      title="창고"
                    >
                      창 {formatNumber(row.warehouse)}
                    </span>
                    <span
                      className="inline-flex rounded-full px-[6px] py-[1px] text-[9px] font-semibold"
                      style={{ background: "rgba(31,209,122,.15)", color: LEGACY_COLORS.green }}
                      title="생산(부서 합)"
                    >
                      생 {formatNumber(row.production)}
                    </span>
                    {row.defective > 0 ? (
                      <span
                        className="inline-flex rounded-full px-[6px] py-[1px] text-[9px] font-semibold"
                        style={{ background: "rgba(242,95,92,.18)", color: LEGACY_COLORS.red }}
                        title="불량(부서 합)"
                      >
                        불 {formatNumber(row.defective)}
                      </span>
                    ) : null}
                  </div>
                  {row.reserver && row.pending > 0 ? (
                    <div
                      className="mt-1 inline-flex rounded-full px-[6px] py-[1px] text-[9px] font-semibold"
                      style={{ background: "rgba(6,182,212,.15)", color: LEGACY_COLORS.cyan }}
                    >
                      🔒 {row.reserver}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {canLoadMore ? (
        <button
          onClick={() => {
            const nextPage = page + 1;
            setPage(nextPage);
            void fetchItems((nextPage - 1) * PAGE_SIZE, true);
          }}
          className="mt-3 w-full rounded-xl border py-3 text-sm font-semibold transition-all hover:brightness-110"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          100개 더 보기
        </button>
      ) : null}

      <ItemDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSaved={async (updated) => {
          showToast({
            type: "success",
            message: `${updated.item_name} 재고를 반영했습니다.`,
          });
          await fetchItems(0, false);
          setSelectedItem(updated);
        }}
      />
    </div>
  );
}
