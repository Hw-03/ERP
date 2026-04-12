"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, type Item } from "@/lib/api";
import { FilterPills } from "./FilterPills";
import { ItemDetailSheet } from "./ItemDetailSheet";
import type { ToastState } from "./Toast";
import {
  LEGACY_COLORS,
  fileTypeBadge,
  formatNumber,
  getStockState,
  normalizeModel,
} from "./legacyUi";

const FILE_TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "원자재", value: "원자재" },
  { label: "조립자재", value: "조립자재" },
  { label: "발생부자재", value: "발생부자재" },
  { label: "완제품", value: "완제품" },
  { label: "미분류", value: "미분류" },
];

const PART_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "자재창고", value: "자재창고" },
  { label: "조립출하", value: "조립출하" },
  { label: "고압파트", value: "고압파트" },
  { label: "진공파트", value: "진공파트" },
  { label: "튜닝파트", value: "튜닝파트" },
  { label: "출하", value: "출하" },
];

const MODEL_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "공용", value: "공용" },
  { label: "DX3000", value: "DX3000" },
  { label: "ADX4000W", value: "ADX4000W" },
  { label: "ADX6000", value: "ADX6000" },
  { label: "COCOON", value: "COCOON" },
  { label: "SOLO", value: "SOLO" },
];

const KPI_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "정상", value: "OK" },
  { label: "부족", value: "LOW" },
  { label: "품절", value: "ZERO" },
];

const PAGE_SIZE = 100;

type DisplayRow = {
  key: string;
  representative: Item;
  quantity: number;
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
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState("ALL");
  const [part, setPart] = useState("ALL");
  const [model, setModel] = useState("ALL");
  const [kpi, setKpi] = useState("ALL");
  const [grouped, setGrouped] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const deferredSearch = useDeferredValue(search);

  async function fetchItems(skip = 0, append = false) {
    try {
      setLoading(true);
      const params: Parameters<typeof api.getItems>[0] = {
        limit: PAGE_SIZE,
        skip,
      };
      if (fileType !== "ALL") params.legacyFileType = fileType;
      if (part !== "ALL") params.legacyPart = part;
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
    setPage(1);
    void fetchItems(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileType, part, model, deferredSearch]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const qty = Number(item.quantity);
      const min = item.min_stock == null ? null : Number(item.min_stock);
      if (kpi === "OK") {
        return qty > 0 && !(min != null && qty < min);
      }
      if (kpi === "LOW") {
        return qty > 0 && min != null && qty < min;
      }
      if (kpi === "ZERO") {
        return qty <= 0;
      }
      return true;
    });
  }, [items, kpi]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (!grouped) {
      return filtered.map((item) => ({
        key: item.item_id,
        representative: item,
        quantity: Number(item.quantity),
        count: 1,
      }));
    }

    const groupedMap = new Map<string, DisplayRow>();
    filtered.forEach((item) => {
      const key = item.item_name.trim().toLowerCase();
      const existing = groupedMap.get(key);
      if (existing) {
        existing.quantity += Number(item.quantity);
        existing.count += 1;
      } else {
        groupedMap.set(key, {
          key,
          representative: item,
          quantity: Number(item.quantity),
          count: 1,
        });
      }
    });
    return Array.from(groupedMap.values());
  }, [filtered, grouped]);

  const totals = useMemo(() => {
    const totalQuantity = displayRows.reduce((sum, row) => sum + row.quantity, 0);
    const normalCount = displayRows.filter((row) => {
      const min = row.representative.min_stock == null ? null : Number(row.representative.min_stock);
      return getStockState(row.quantity, min).label === "정상";
    }).length;
    const lowCount = displayRows.filter((row) => {
      const min = row.representative.min_stock == null ? null : Number(row.representative.min_stock);
      return getStockState(row.quantity, min).label === "부족";
    }).length;
    const zeroCount = displayRows.filter((row) => row.quantity <= 0).length;
    return { totalQuantity, normalCount, lowCount, zeroCount };
  }, [displayRows]);

  const canLoadMore = items.length >= page * PAGE_SIZE;

  return (
    <div className="pb-4">
      <button
        onClick={onOpenHistory}
        className="mb-[10px] flex w-full items-center justify-center rounded-xl border px-4 py-[13px] text-[15px] font-bold"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.muted2,
        }}
      >
        📋 입출고 내역 확인
      </button>

      <div className="mb-[10px] flex items-center gap-2 rounded-[11px] border px-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <span>🔍</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="품명·모델·공급처·ID"
          className="w-full bg-transparent py-[10px] text-sm outline-none"
          style={{ color: LEGACY_COLORS.text }}
        />
      </div>

      <FilterPills options={FILE_TYPE_OPTIONS} value={fileType} onChange={setFileType} />
      <FilterPills options={PART_OPTIONS} value={part} onChange={setPart} activeColor={LEGACY_COLORS.green} />
      <FilterPills options={MODEL_OPTIONS} value={model} onChange={setModel} activeColor={LEGACY_COLORS.cyan} />

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
            className="relative overflow-hidden rounded-xl border px-2 py-[10px] text-left"
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
          {displayRows.length}개 품목 · 총 재고 {formatNumber(totals.totalQuantity)}
        </div>
        <div className="flex items-center gap-2">
          <FilterPills options={KPI_OPTIONS} value={kpi} onChange={setKpi} activeColor={LEGACY_COLORS.purple} />
          <button
            onClick={() => setGrouped((current) => !current)}
            className="rounded-full border px-[11px] py-1 text-[10px] font-semibold"
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
          불러오는 중...
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
              row.quantity,
              item.min_stock == null ? null : Number(item.min_stock),
            );
            const badge = fileTypeBadge(item.legacy_file_type);
            const fillWidth = Math.max(10, Math.min(100, row.quantity > 0 ? (row.quantity / Math.max(1, Number(item.min_stock ?? row.quantity))) * 100 : 6));

            return (
              <button
                key={row.key}
                onClick={() => setSelectedItem(item)}
                className="flex w-full items-center gap-[10px] px-[14px] py-3 text-left"
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
                    <span
                      className="inline-flex rounded-full px-[7px] py-[2px] text-[9px] font-bold"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                    {row.count > 1 ? (
                      <span
                        className="inline-flex rounded-full px-[7px] py-[2px] text-[9px] font-bold"
                        style={{ background: "rgba(6,182,212,.15)", color: LEGACY_COLORS.cyan }}
                      >
                        {row.count}개 품목 묶음
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-sm font-semibold">{item.item_name}</div>
                  <div className="mt-0.5 truncate text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {item.item_code}
                    {item.legacy_part ? ` · ${item.legacy_part}` : ""}
                    {normalizeModel(item.legacy_model) !== "공용" ? ` · ${normalizeModel(item.legacy_model)}` : ""}
                    {item.supplier ? ` · ${item.supplier}` : ""}
                  </div>
                  <div className="mt-2 h-[6px] rounded-full" style={{ background: LEGACY_COLORS.s3 }}>
                    <div
                      className="h-[6px] rounded-full"
                      style={{
                        width: `${fillWidth}%`,
                        background: stockState.color,
                      }}
                    />
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="font-mono text-lg font-bold" style={{ color: stockState.color }}>
                    {formatNumber(row.quantity)}
                  </div>
                  <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    {item.unit}
                  </div>
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
            void fetchItems(nextPage * PAGE_SIZE - PAGE_SIZE, true);
          }}
          className="mt-3 w-full py-[14px] text-center text-[13px] font-bold"
          style={{ color: LEGACY_COLORS.blue }}
        >
          100개 더보기
        </button>
      ) : null}

      <ItemDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSaved={(updated) => {
          setItems((current) => current.map((item) => (item.item_id === updated.item_id ? updated : item)));
          setSelectedItem(updated);
          showToast({ message: "재고가 업데이트되었습니다.", type: "success" });
        }}
      />
    </div>
  );
}
