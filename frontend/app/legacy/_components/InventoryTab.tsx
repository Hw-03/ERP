"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, type Item } from "@/lib/api";
import { FilterPills } from "./FilterPills";
import { ItemDetailSheet } from "./ItemDetailSheet";
import type { ToastState } from "./Toast";

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
  { label: "재고있음", value: "IN_STOCK" },
  { label: "재고0", value: "ZERO" },
];

const PAGE_SIZE = 100;

export function InventoryTab({ showToast }: { showToast: (t: ToastState) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState("ALL");
  const [part, setPart] = useState("ALL");
  const [model, setModel] = useState("ALL");
  const [kpi, setKpi] = useState("ALL");
  const [grouped, setGrouped] = useState(false);

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const deferredSearch = useDeferredValue(search);

  const loadItems = async (reset = false) => {
    try {
      setLoading(true);
      const skip = reset ? 0 : (page - 1) * PAGE_SIZE;
      const params: Parameters<typeof api.getItems>[0] = {
        limit: PAGE_SIZE,
        skip,
      };
      if (fileType !== "ALL") params.legacyFileType = fileType;
      if (part !== "ALL") params.legacyPart = part;
      if (model !== "ALL") params.legacyModel = model;
      if (deferredSearch.trim()) params.search = deferredSearch.trim();

      const data = await api.getItems(params);
      if (reset) {
        setItems(data);
        setPage(1);
      } else {
        setItems((prev) => (skip === 0 ? data : [...prev, ...data]));
      }
      setTotal(data.length < PAGE_SIZE ? skip + data.length : skip + data.length + 1);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "품목을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadItems(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileType, part, model, deferredSearch]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (kpi === "IN_STOCK" && Number(item.quantity) <= 0) return false;
      if (kpi === "ZERO" && Number(item.quantity) !== 0) return false;
      return true;
    });
  }, [items, kpi]);

  const displayItems = useMemo(() => {
    if (!grouped) return filteredItems;
    const seen = new Set<string>();
    return filteredItems.filter((item) => {
      if (seen.has(item.item_name)) return false;
      seen.add(item.item_name);
      return true;
    });
  }, [filteredItems, grouped]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    const skip = nextPage * PAGE_SIZE - PAGE_SIZE;
    const params: Parameters<typeof api.getItems>[0] = { limit: PAGE_SIZE, skip };
    if (fileType !== "ALL") params.legacyFileType = fileType;
    if (part !== "ALL") params.legacyPart = part;
    if (model !== "ALL") params.legacyModel = model;
    if (deferredSearch.trim()) params.search = deferredSearch.trim();
    api.getItems(params).then((data) => {
      setItems((prev) => [...prev, ...data]);
    });
  };

  const canLoadMore = items.length >= page * PAGE_SIZE;

  return (
    <div className="flex flex-col">
      {/* Filters bar */}
      <div className="space-y-2 bg-slate-900/60 px-4 pb-3 pt-3">
        {/* Search */}
        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2">
          <span className="text-slate-500">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="품목명, 코드, 사양, 바코드 검색"
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-500">
              ✕
            </button>
          )}
        </div>

        <FilterPills options={FILE_TYPE_OPTIONS} value={fileType} onChange={setFileType} />
        <FilterPills
          options={PART_OPTIONS}
          value={part}
          onChange={setPart}
          colorActive="bg-purple-600 border-purple-500 text-white"
        />
        <div className="flex gap-2">
          <div className="flex-1 overflow-x-auto">
            <FilterPills
              options={MODEL_OPTIONS}
              value={model}
              onChange={setModel}
              colorActive="bg-teal-600 border-teal-500 text-white"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <FilterPills
            options={KPI_OPTIONS}
            value={kpi}
            onChange={setKpi}
            colorActive="bg-emerald-600 border-emerald-500 text-white"
          />
          <button
            onClick={() => setGrouped((g) => !g)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${
              grouped
                ? "border-amber-500 bg-amber-600 text-white"
                : "border-slate-700 text-slate-500"
            }`}
          >
            그룹
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 border-b border-slate-800 px-4 py-2">
        <span className="text-xs text-slate-500">
          표시 <strong className="text-slate-200">{displayItems.length}</strong>
        </span>
        <span className="text-xs text-slate-500">
          재고합{" "}
          <strong className="font-mono text-cyan-300">
            {displayItems.reduce((s, i) => s + Number(i.quantity), 0).toLocaleString()}
          </strong>
        </span>
        <span className="text-xs text-slate-500">
          재고0{" "}
          <strong className="text-amber-300">
            {displayItems.filter((i) => Number(i.quantity) === 0).length}
          </strong>
        </span>
      </div>

      {/* Item list */}
      {error ? (
        <p className="px-4 py-6 text-sm text-red-400">{error}</p>
      ) : loading && items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">로딩 중...</p>
      ) : displayItems.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">조건에 맞는 품목이 없습니다.</p>
      ) : (
        <>
          <div className="divide-y divide-slate-800/60">
            {displayItems.map((item) => {
              const qty = Number(item.quantity);
              const isLow = item.min_stock != null && qty < Number(item.min_stock);
              return (
                <button
                  key={item.item_id}
                  onClick={() => setSelectedItem(item)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-800/40 active:bg-slate-800/70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{item.item_name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {item.item_code}
                      {item.legacy_part ? ` · ${item.legacy_part}` : ""}
                      {item.legacy_model && item.legacy_model !== "공용"
                        ? ` · ${item.legacy_model}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-mono text-base font-bold ${
                        qty === 0
                          ? "text-red-400"
                          : isLow
                            ? "text-amber-400"
                            : "text-cyan-300"
                      }`}
                    >
                      {qty.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-500">{item.unit}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {canLoadMore && (
            <button
              onClick={handleLoadMore}
              className="mx-4 my-3 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-400 transition hover:bg-slate-800/50"
            >
              100개 더 보기
            </button>
          )}
        </>
      )}

      <ItemDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSaved={(updated) => {
          setItems((prev) => prev.map((i) => (i.item_id === updated.item_id ? updated : i)));
          setSelectedItem(updated);
          showToast({ message: "재고가 업데이트되었습니다.", type: "success" });
        }}
      />
    </div>
  );
}
