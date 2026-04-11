"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Minus,
  PackageSearch,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Category, type Item, type TransactionLog } from "@/lib/api";

const CATEGORY_OPTIONS: { label: string; value: Category | "ALL" }[] = [
  { label: "전체", value: "ALL" },
  { label: "원자재", value: "RM" },
  { label: "튜브 반제품", value: "TA" },
  { label: "튜브 완제품", value: "TF" },
  { label: "고압 반제품", value: "HA" },
  { label: "고압 완제품", value: "HF" },
  { label: "진공 반제품", value: "VA" },
  { label: "진공 완제품", value: "VF" },
  { label: "조립 반제품", value: "BA" },
  { label: "조립 완제품", value: "BF" },
  { label: "완제품", value: "FG" },
  { label: "미분류", value: "UK" },
];

const STOCK_FILTERS = [
  { label: "전체 상태", value: "ALL" },
  { label: "재고 있음", value: "IN_STOCK" },
  { label: "재고 0", value: "ZERO" },
  { label: "미분류만", value: "UK_ONLY" },
] as const;

const CATEGORY_LABELS: Record<Category, string> = {
  RM: "원자재",
  TA: "튜브 반제품",
  TF: "튜브 완제품",
  HA: "고압 반제품",
  HF: "고압 완제품",
  VA: "진공 반제품",
  VF: "진공 완제품",
  BA: "조립 반제품",
  BF: "조립 완제품",
  FG: "완제품",
  UK: "미분류",
};

const TX_TYPE_LABELS = {
  RECEIVE: "입고",
  PRODUCE: "생산 입고",
  SHIP: "출고",
  ADJUST: "조정",
  BACKFLUSH: "자동 차감",
};

type ActionMode = "ADJUST" | "RECEIVE" | "SHIP";

type StockFilter = (typeof STOCK_FILTERS)[number]["value"];

function formatQuantity(value: number | string) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function CategoryPills({
  value,
  onChange,
}: {
  value: Category | "ALL";
  onChange: (value: Category | "ALL") => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {CATEGORY_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
            option.value === value
              ? "border-blue-500 bg-blue-500 text-white"
              : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StockPills({
  value,
  onChange,
}: {
  value: StockFilter;
  onChange: (value: StockFilter) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {STOCK_FILTERS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
            option.value === value
              ? "border-emerald-500 bg-emerald-500 text-slate-950"
              : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function InventoryDetailModal({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: (updatedItem: Item) => void;
}) {
  const [quantity, setQuantity] = useState("0");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<Category>("RM");
  const [mode, setMode] = useState<ActionMode>("ADJUST");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionLog[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  useEffect(() => {
    if (!item) return;
    setQuantity(String(Number(item.quantity)));
    setReason("");
    setLocation(item.location ?? "");
    setCategory(item.category);
    setMode("ADJUST");
    setError(null);
    setLoadingTransactions(true);
    api
      .getTransactions({ itemId: item.item_id, limit: 10 })
      .then(setRecentTransactions)
      .catch(() => setRecentTransactions([]))
      .finally(() => setLoadingTransactions(false));
  }, [item]);

  if (!item) return null;

  const bumpQuantity = (delta: number) => {
    const current = Number(quantity || 0);
    const minimum = mode === "ADJUST" ? 0 : 1;
    const next = Math.max(minimum, current + delta);
    setQuantity(String(next));
  };

  const handleModeChange = (nextMode: ActionMode) => {
    setMode(nextMode);
    setError(null);
    if (nextMode === "ADJUST") {
      setQuantity(String(Number(item.quantity)));
    } else {
      setQuantity("1");
    }
  };

  const handleSave = async () => {
    const nextQuantity = Number(quantity);
    const changedQuantity = nextQuantity !== Number(item.quantity);
    const changedLocation = location !== (item.location ?? "");
    const changedCategory = category !== item.category;

    if (Number.isNaN(nextQuantity) || nextQuantity < 0) {
      setError("수량은 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    if (mode !== "ADJUST" && nextQuantity <= 0) {
      setError("입고와 출고 수량은 1 이상이어야 합니다.");
      return;
    }

    if ((mode === "ADJUST" && (changedQuantity || changedLocation)) || mode !== "ADJUST") {
      if (!reason.trim()) {
        setError("처리 사유를 입력해 주세요.");
        return;
      }
    }

    if (mode === "ADJUST" && !changedQuantity && !changedLocation && !changedCategory) {
      setError("변경된 내용이 없습니다.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      let updatedItem = item;

      if (changedCategory) {
        const updatedMaster = await api.updateItem(item.item_id, { category });
        updatedItem = {
          ...updatedItem,
          category: updatedMaster.category,
          updated_at: updatedMaster.updated_at,
        };
      }

      if (mode === "ADJUST" && (changedQuantity || changedLocation)) {
        const response = await api.adjustInventory({
          item_id: item.item_id,
          quantity: nextQuantity,
          reason,
          location: location || undefined,
        });

        updatedItem = {
          ...updatedItem,
          quantity: Number(response.quantity),
          location: response.location,
          updated_at: response.updated_at,
        };
      }

      if (mode === "RECEIVE") {
        const response = await api.receiveInventory({
          item_id: item.item_id,
          quantity: nextQuantity,
          location: location || undefined,
          notes: reason,
        });

        updatedItem = {
          ...updatedItem,
          quantity: Number(response.quantity),
          location: response.location,
          updated_at: response.updated_at,
        };
      }

      if (mode === "SHIP") {
        const response = await api.shipInventory({
          item_id: item.item_id,
          quantity: nextQuantity,
          location: location || undefined,
          notes: reason,
        });

        updatedItem = {
          ...updatedItem,
          quantity: Number(response.quantity),
          location: response.location,
          updated_at: response.updated_at,
        };
      }

      onSaved(updatedItem);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? `변경 사항 저장 실패: ${err.message}` : "변경 사항 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[28px] border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-5">
          <div>
            <p className="font-mono text-xs text-blue-400">{item.item_code}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-100">{item.item_name}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {CATEGORY_LABELS[item.category]} · 단위 {item.unit}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5 xl:grid-cols-[1.05fr,0.95fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                품목 정보
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-6">
                  <dt className="text-slate-500">사양</dt>
                  <dd className="text-right text-slate-200">{item.spec || "사양 정보 없음"}</dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-slate-500">현재고</dt>
                  <dd className="font-mono text-cyan-300">{formatQuantity(item.quantity)}</dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-slate-500">위치</dt>
                  <dd className="text-right text-slate-200">{item.location || "-"}</dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-slate-500">최근 수정</dt>
                  <dd className="text-right text-slate-200">
                    {new Date(item.updated_at).toLocaleString("ko-KR")}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  최근 거래 이력
                </p>
                <span className="text-xs text-slate-600">최대 10건</span>
              </div>
              <div className="mt-4 space-y-3">
                {loadingTransactions ? (
                  <p className="text-sm text-slate-500">거래 이력을 불러오는 중입니다.</p>
                ) : recentTransactions.length === 0 ? (
                  <p className="text-sm text-slate-500">표시할 이력이 없습니다.</p>
                ) : (
                  recentTransactions.map((tx) => (
                    <div
                      key={tx.log_id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-100">
                          {TX_TYPE_LABELS[tx.transaction_type]}
                        </p>
                        <p
                          className={`font-mono text-sm ${
                            tx.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"
                          }`}
                        >
                          {tx.quantity_change >= 0 ? "+" : ""}
                          {Number(tx.quantity_change).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {new Date(tx.created_at).toLocaleString("ko-KR")}
                        {tx.notes ? ` · ${tx.notes}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              재고 및 분류 조정
            </p>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  { key: "ADJUST", label: "절대값 조정" },
                  { key: "RECEIVE", label: "입고" },
                  { key: "SHIP", label: "출고" },
                ].map((option) => (
                  <button
                    key={option.key}
                    onClick={() => handleModeChange(option.key as ActionMode)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      mode === option.key
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {mode === "ADJUST" ? "조정 후 최종 수량" : "처리 수량"}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => bumpQuantity(-1)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-300 transition hover:bg-red-500/20"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-center font-mono text-2xl text-slate-100 outline-none"
                />
                <button
                  onClick={() => bumpQuantity(1)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[1, 10, 50, 100].map((value) => (
                  <button
                    key={value}
                    onClick={() => bumpQuantity(value)}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
                  >
                    +{value}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-2 block text-xs text-slate-500">카테고리</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as Category)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none"
                >
                  {CATEGORY_OPTIONS.filter((option) => option.value !== "ALL").map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs text-slate-500">위치</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="보관 위치"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs text-slate-500">
                  {mode === "ADJUST" ? "조정 사유" : "처리 메모"}
                </span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    mode === "ADJUST"
                      ? "실사 반영, 위치 변경, 카운트 보정"
                      : "입고 또는 출고 사유"
                  }
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </label>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {saving
                ? "처리 중..."
                : mode === "ADJUST"
                  ? "변경 사항 저장"
                  : mode === "RECEIVE"
                    ? "입고 처리"
                    : "출고 처리"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | "ALL">("ALL");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const category = new URLSearchParams(window.location.search).get("category");
    if (category && CATEGORY_OPTIONS.some((option) => option.value === category)) {
      setSelectedCategory(category as Category);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      try {
        setLoading(true);
        const data = await api.getItems({ limit: 2000 });
        if (!cancelled) {
          setItems(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `품목 목록을 불러오지 못했습니다: ${err.message}`
              : "품목 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadItems();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();

    return items.filter((item) => {
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) {
        return false;
      }

      if (stockFilter === "IN_STOCK" && Number(item.quantity) <= 0) {
        return false;
      }
      if (stockFilter === "ZERO" && Number(item.quantity) !== 0) {
        return false;
      }
      if (stockFilter === "UK_ONLY" && item.category !== "UK") {
        return false;
      }

      if (!keyword) return true;

      const haystack = [
        item.item_code,
        item.item_name,
        item.spec ?? "",
        item.location ?? "",
        CATEGORY_LABELS[item.category],
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [deferredSearch, items, selectedCategory, stockFilter]);

  const totals = useMemo(
    () =>
      filteredItems.reduce(
        (acc, item) => {
          acc.count += 1;
          acc.quantity += Number(item.quantity);
          return acc;
        },
        { count: 0, quantity: 0 },
      ),
    [filteredItems],
  );

  const zeroStockCount = useMemo(
    () => filteredItems.filter((item) => Number(item.quantity) === 0).length,
    [filteredItems],
  );

  const handleSaved = (updatedItem: Item) => {
    setItems((current) =>
      current.map((item) => (item.item_id === updatedItem.item_id ? updatedItem : item)),
    );
    setSelectedItem(updatedItem);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        <section className="rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Inventory Control
              </p>
              <h2 className="mt-3 text-4xl font-black tracking-tight">전체 품목 리스트</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                레거시 재고관리앱의 검색 중심 테이블 구조를 현재 ERP에 맞게 이식했습니다.
                품목명, 코드, 사양, 위치를 빠르게 검색하고 카테고리·재고 상태별로 필터링할 수
                있습니다. 행을 클릭하면 상세 이력과 재고 조정 시트가 열립니다.
              </p>
            </div>

            <div className="grid min-w-[320px] gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  현재 표시 품목
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-100">{totals.count}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  현재 표시 재고
                </p>
                <p className="mt-2 text-3xl font-bold text-cyan-300">
                  {formatQuantity(totals.quantity)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  재고 0 품목
                </p>
                <p className="mt-2 text-3xl font-bold text-amber-300">{zeroStockCount}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr,240px]">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="품목명, 품목코드, 사양, 위치 검색"
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>

            <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              <span>빠른 필터</span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <CategoryPills value={selectedCategory} onChange={setSelectedCategory} />
            <StockPills value={stockFilter} onChange={setStockFilter} />
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : loading ? (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-10 text-center text-sm text-slate-400">
            품목 데이터를 불러오는 중입니다.
          </div>
        ) : (
          <section className="mt-6 overflow-hidden rounded-[24px] border border-slate-800 bg-slate-900/60 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Inventory Table
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  행을 클릭하면 상세 정보와 최근 거래 이력이 열립니다.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-400">
                <PackageSearch className="h-4 w-4" />
                실시간 필터링
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
                  <tr className="border-b border-slate-800">
                    <th className="px-5 py-3 text-left text-slate-500">품목코드</th>
                    <th className="px-5 py-3 text-left text-slate-500">품목명</th>
                    <th className="px-5 py-3 text-left text-slate-500">사양</th>
                    <th className="px-5 py-3 text-left text-slate-500">카테고리</th>
                    <th className="px-5 py-3 text-left text-slate-500">위치</th>
                    <th className="px-5 py-3 text-right text-slate-500">현재고</th>
                    <th className="px-5 py-3 text-left text-slate-500">단위</th>
                    <th className="px-5 py-3 text-right text-slate-500">최근 수정</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => (
                    <tr
                      key={item.item_id}
                      onClick={() => setSelectedItem(item)}
                      className={`cursor-pointer border-b border-slate-800/80 transition hover:bg-slate-800/70 ${
                        index % 2 === 0 ? "bg-slate-900/20" : ""
                      }`}
                    >
                      <td className="px-5 py-4 font-mono text-xs text-blue-300">{item.item_code}</td>
                      <td className="px-5 py-4 text-slate-100">{item.item_name}</td>
                      <td className="px-5 py-4 text-slate-400">{item.spec || "-"}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-xs text-slate-300">
                          {CATEGORY_LABELS[item.category]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-400">{item.location || "-"}</td>
                      <td className="px-5 py-4 text-right font-mono text-cyan-300">
                        {formatQuantity(item.quantity)}
                      </td>
                      <td className="px-5 py-4 text-slate-400">{item.unit}</td>
                      <td className="px-5 py-4 text-right text-xs text-slate-500">
                        {new Date(item.updated_at).toLocaleDateString("ko-KR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredItems.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  조건에 맞는 품목이 없습니다.
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <InventoryDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}
