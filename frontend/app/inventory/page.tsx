"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Minus, PackageSearch, Plus, Search, X } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Category, type Item, type TransactionLog } from "@/lib/api";

// ─── Constants ───────────────────────────────────────────────────────────────

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

const TX_TYPE_LABELS: Record<string, string> = {
  RECEIVE: "입고",
  PRODUCE: "생산 입고",
  SHIP: "출고",
  ADJUST: "조정",
  BACKFLUSH: "자동 차감",
};

type ActionMode = "ADJUST" | "RECEIVE" | "SHIP";
type StockFilter = "ALL" | "IN_STOCK" | "LOW" | "ZERO" | "UK_ONLY";

function formatQuantity(value: number | string) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function stockBadge(qty: number) {
  if (qty === 0)
    return { label: "품절", color: "bg-red-500/20 text-red-400 border-red-800/40" };
  if (qty <= 10)
    return { label: "부족", color: "bg-amber-500/20 text-amber-400 border-amber-800/40" };
  return { label: "정상", color: "bg-emerald-500/20 text-emerald-400 border-emerald-800/40" };
}

// ─── KPI Bar ─────────────────────────────────────────────────────────────────

function KpiBar({
  totalItems,
  totalQuantity,
  lowCount,
  zeroCount,
  onClickLow,
  onClickZero,
}: {
  totalItems: number;
  totalQuantity: number;
  lowCount: number;
  zeroCount: number;
  onClickLow: () => void;
  onClickZero: () => void;
}) {
  return (
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-6">
      {/* 총 운영 자산 */}
      <div className="flex h-[64px] flex-1 flex-col justify-center rounded-2xl border border-slate-800 bg-slate-900/60 px-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          총 운영 자산
        </p>
        <p className="mt-0.5 text-base font-bold text-slate-100">
          {totalItems.toLocaleString()} 품목&nbsp;·&nbsp;
          <span className="font-mono text-cyan-300">{formatQuantity(totalQuantity)}</span>
        </p>
      </div>

      {/* 발주 주의 */}
      <button
        onClick={onClickLow}
        className="flex h-[64px] flex-1 flex-col justify-center rounded-2xl border border-amber-800/40 bg-amber-950/20 px-4 text-left transition hover:bg-amber-950/40"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-500">
          ⚠️ 발주 주의
        </p>
        <p className="mt-0.5 text-lg font-bold text-amber-400">
          {lowCount.toLocaleString()} 품목
        </p>
      </button>

      {/* 생산 중단 위기 */}
      <button
        onClick={onClickZero}
        className="flex h-[64px] flex-1 flex-col justify-center rounded-2xl border border-red-800/40 bg-red-950/20 px-4 text-left transition hover:bg-red-950/40"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-500">
          <span className="animate-pulse">🔴</span>&nbsp;생산 중단 위기
        </p>
        <p className="mt-0.5 text-lg font-bold text-red-400">
          {zeroCount.toLocaleString()} 품목
        </p>
      </button>
    </div>
  );
}

// ─── Master Panel ─────────────────────────────────────────────────────────────

function MasterPanel({
  items,
  search,
  setSearch,
  selectedCategory,
  setSelectedCategory,
  stockFilter,
  setStockFilter,
  selectedItem,
  onSelect,
  rowRefs,
  onKeyDown,
}: {
  items: Item[];
  search: string;
  setSearch: (v: string) => void;
  selectedCategory: Category | "ALL";
  setSelectedCategory: (v: Category | "ALL") => void;
  stockFilter: StockFilter;
  setStockFilter: (v: StockFilter) => void;
  selectedItem: Item | null;
  onSelect: (item: Item, index: number) => void;
  rowRefs: MutableRefObject<(HTMLTableRowElement | null)[]>;
  onKeyDown: (e: { key: string; preventDefault(): void }) => void;
}) {
  const hasFilter =
    selectedCategory !== "ALL" || stockFilter !== "ALL" || search.trim() !== "";

  const resetFilters = () => {
    setSearch("");
    setSelectedCategory("ALL");
    setStockFilter("ALL");
  };

  const STOCK_CHIPS: { label: string; value: StockFilter }[] = [
    { label: "전체 상태", value: "ALL" },
    { label: "재고 있음", value: "IN_STOCK" },
    { label: "발주 필요", value: "LOW" },
    { label: "품절", value: "ZERO" },
    { label: "미분류만", value: "UK_ONLY" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-slate-800">
      {/* Filter bar */}
      <div className="shrink-0 space-y-2 border-b border-slate-800 bg-slate-950/80 px-4 py-3">
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="품목명, 품목코드, 사양, 위치 검색"
              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as Category | "ALL")}
            className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 outline-none"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {hasFilter && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
            >
              <X className="h-3 w-3" />
              초기화
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STOCK_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setStockFilter(chip.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                stockFilter === chip.value
                  ? "border-blue-500 bg-blue-500/20 text-blue-300"
                  : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        className="flex-1 overflow-y-auto outline-none"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <table className="w-full min-w-[600px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
            <tr className="border-b border-slate-800">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">품목코드</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">품목명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">사양</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">카테고리</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">현재고</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">위치</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const qty = Number(item.quantity);
              const badge = stockBadge(qty);
              const isSelected = selectedItem?.item_id === item.item_id;
              return (
                <tr
                  key={item.item_id}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  onClick={() => onSelect(item, index)}
                  className={`cursor-pointer border-b border-slate-800/60 transition ${
                    isSelected
                      ? "border-l-2 border-l-blue-500 bg-blue-900/30"
                      : "hover:bg-slate-800/50"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-blue-300">{item.item_code}</td>
                  <td className="px-4 py-3 text-slate-100">{item.item_name}</td>
                  <td className="max-w-[120px] truncate px-4 py-3 text-xs text-slate-400">
                    {item.spec || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-xs text-slate-300">
                      {CATEGORY_LABELS[item.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.color}`}
                    >
                      {formatQuantity(qty)}
                      <span className="text-[10px]">{badge.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{item.location || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <PackageSearch className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">조건에 맞는 품목이 없습니다.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-950/80 px-4 py-2 text-xs text-slate-500">
        {items.length.toLocaleString()} 품목 표시 중
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  item,
  onItemUpdate,
  onToast,
}: {
  item: Item | null;
  onItemUpdate: (updated: Item) => void;
  onToast: (message: string, type: "success" | "error") => void;
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

  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 border-l border-slate-800 bg-slate-950/50 px-8 text-center text-slate-500">
        <PackageSearch className="h-14 w-14 opacity-30" />
        <p className="text-sm leading-relaxed">
          품목을 선택하면 상세 정보와
          <br />
          이력을 확인하세요
        </p>
      </div>
    );
  }

  const bumpQuantity = (delta: number) => {
    const current = Number(quantity || 0);
    const minimum = mode === "ADJUST" ? 0 : 1;
    setQuantity(String(Math.max(minimum, current + delta)));
  };

  const handleModeChange = (nextMode: ActionMode) => {
    setMode(nextMode);
    setError(null);
    setQuantity(nextMode === "ADJUST" ? String(Number(item.quantity)) : "1");
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

      onItemUpdate(updatedItem);
      onToast(
        mode === "ADJUST"
          ? "변경 사항이 저장되었습니다."
          : mode === "RECEIVE"
            ? "입고 처리가 완료되었습니다."
            : "출고 처리가 완료되었습니다.",
        "success",
      );

      // Refresh timeline
      setLoadingTransactions(true);
      api
        .getTransactions({ itemId: item.item_id, limit: 10 })
        .then(setRecentTransactions)
        .catch(() => setRecentTransactions([]))
        .finally(() => setLoadingTransactions(false));

      setReason("");
      if (mode !== "ADJUST") setQuantity("1");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.";
      setError(msg);
      onToast(`저장 실패: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const qty = Number(item.quantity);
  const badge = stockBadge(qty);

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-slate-800 bg-slate-950/50">
      {/* Item header */}
      <div className="shrink-0 border-b border-slate-800 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-blue-400">{item.item_code}</p>
            <h2 className="mt-1 text-xl font-bold leading-tight text-slate-100">{item.item_name}</h2>
            {item.spec && (
              <p className="mt-1 truncate text-xs text-slate-400">{item.spec}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-xs text-slate-300">
                {CATEGORY_LABELS[item.category]}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge.color}`}
              >
                {badge.label}
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">현재고</p>
            <p className="font-mono text-3xl font-black text-cyan-300">{formatQuantity(qty)}</p>
          </div>
        </div>
      </div>

      {/* Quick Action */}
      <div className="shrink-0 space-y-3 border-b border-slate-800 px-5 py-4">
        {/* Mode tabs */}
        <div className="flex gap-2">
          {(
            [
              { key: "ADJUST" as ActionMode, label: "조정" },
              { key: "RECEIVE" as ActionMode, label: "입고" },
              { key: "SHIP" as ActionMode, label: "출고" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              onClick={() => handleModeChange(option.key)}
              className={`flex-1 rounded-xl border py-2 text-sm font-medium transition ${
                mode === option.key
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Quantity input */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => bumpQuantity(-1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-300 transition hover:bg-red-500/20"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-center font-mono text-2xl text-slate-100 outline-none"
          />
          <button
            onClick={() => bumpQuantity(1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Quick bump */}
        <div className="grid grid-cols-4 gap-1.5">
          {[1, 10, 50, 100].map((val) => (
            <button
              key={val}
              onClick={() => bumpQuantity(val)}
              className="rounded-lg border border-slate-800 bg-slate-900/60 py-1.5 text-xs text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
            >
              +{val}
            </button>
          ))}
        </div>

        {/* Category (adjust mode only — shown compactly) */}
        {mode === "ADJUST" && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none"
          >
            {CATEGORY_OPTIONS.filter((o) => o.value !== "ALL").map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {/* Location */}
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="보관 위치"
          className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />

        {/* Reason */}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={mode === "ADJUST" ? "조정 사유 (필수)" : "처리 메모 (필수)"}
          className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />

        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
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

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          최근 거래 이력 (최대 10건)
        </p>
        {loadingTransactions ? (
          <p className="text-sm text-slate-500">로딩 중...</p>
        ) : recentTransactions.length === 0 ? (
          <p className="text-sm text-slate-500">거래 이력이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {recentTransactions.map((tx) => (
              <div
                key={tx.log_id}
                className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-100">
                    {TX_TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type}
                  </span>
                  <span
                    className={`font-mono text-sm ${
                      tx.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {tx.quantity_change >= 0 ? "+" : ""}
                    {Number(tx.quantity_change).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(tx.created_at).toLocaleString("ko-KR")}
                  {tx.notes ? ` · ${tx.notes}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-2xl backdrop-blur ${
        type === "success"
          ? "border-emerald-700 bg-emerald-950/90 text-emerald-300"
          : "border-red-700 bg-red-950/90 text-red-300"
      }`}
    >
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | "ALL">("ALL");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const deferredSearch = useDeferredValue(search);

  // URL param: pre-select category
  useEffect(() => {
    const category = new URLSearchParams(window.location.search).get("category");
    if (category && CATEGORY_OPTIONS.some((opt) => opt.value === category)) {
      setSelectedCategory(category as Category);
    }
  }, []);

  // Load items
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
        if (!cancelled) setLoading(false);
      }
    }
    loadItems();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset focused row when filter changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [deferredSearch, selectedCategory, stockFilter]);

  // Filter items
  const filteredItems = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) return false;
      const qty = Number(item.quantity);
      if (stockFilter === "IN_STOCK" && qty <= 0) return false;
      if (stockFilter === "LOW" && !(qty > 0 && qty <= 10)) return false;
      if (stockFilter === "ZERO" && qty !== 0) return false;
      if (stockFilter === "UK_ONLY" && item.category !== "UK") return false;
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

  // KPI from all items
  const kpi = useMemo(() => {
    const totalItems = items.length;
    const totalQuantity = items.reduce((acc, i) => acc + Number(i.quantity), 0);
    const lowCount = items.filter((i) => {
      const q = Number(i.quantity);
      return q > 0 && q <= 10;
    }).length;
    const zeroCount = items.filter((i) => Number(i.quantity) === 0).length;
    return { totalItems, totalQuantity, lowCount, zeroCount };
  }, [items]);

  // Keyboard navigation
  const handleKeyDown = (e: { key: string; preventDefault(): void }) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(focusedIndex + 1, filteredItems.length - 1);
      setFocusedIndex(next);
      setSelectedItem(filteredItems[next]);
      rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(focusedIndex - 1, 0);
      setFocusedIndex(prev);
      setSelectedItem(filteredItems[prev]);
      rowRefs.current[prev]?.scrollIntoView({ block: "nearest" });
    }
  };

  const handleSelect = (item: Item, index: number) => {
    setSelectedItem(item);
    setFocusedIndex(index);
  };

  const handleItemUpdate = (updatedItem: Item) => {
    setItems((current) =>
      current.map((i) => (i.item_id === updatedItem.item_id ? updatedItem : i)),
    );
    setSelectedItem(updatedItem);
  };

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <AppHeader />

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          품목 데이터를 불러오는 중입니다...
        </div>
      ) : error ? (
        <div className="m-6 rounded-2xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : (
        <>
          <KpiBar
            totalItems={kpi.totalItems}
            totalQuantity={kpi.totalQuantity}
            lowCount={kpi.lowCount}
            zeroCount={kpi.zeroCount}
            onClickLow={() => setStockFilter("LOW")}
            onClickZero={() => setStockFilter("ZERO")}
          />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(600px,1.5fr)_minmax(400px,1fr)]">
            <MasterPanel
              items={filteredItems}
              search={search}
              setSearch={setSearch}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              stockFilter={stockFilter}
              setStockFilter={setStockFilter}
              selectedItem={selectedItem}
              onSelect={handleSelect}
              rowRefs={rowRefs}
              onKeyDown={handleKeyDown}
            />
            <DetailPanel
              item={selectedItem}
              onItemUpdate={handleItemUpdate}
              onToast={showToast}
            />
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
