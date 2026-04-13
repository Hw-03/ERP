"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownUp,
  ArchiveX,
  Boxes,
  Minus,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
  Search,
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
  PRODUCE: "생산입고",
  SHIP: "출고",
  ADJUST: "조정",
  BACKFLUSH: "자동차감",
};

type ActionMode = "ADJUST" | "RECEIVE" | "SHIP";
type StockFilter = "ALL" | "SAFETY" | "ZERO" | "UK_ONLY";
type ToastState = { message: string; type: "success" | "error" } | null;

function formatQuantity(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getStatusMeta(quantity: number, minStock: number | null | undefined) {
  const threshold = minStock ? Number(minStock) : 10;
  if (quantity <= 0) return { label: "품절", tone: "border-red-500/30 bg-red-500/15 text-red-200", dot: "bg-red-400" };
  if (quantity < threshold) return { label: "발주필요", tone: "border-amber-500/30 bg-amber-500/15 text-amber-100", dot: "bg-amber-400" };
  return { label: "정상", tone: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100", dot: "bg-emerald-400" };
}

function KpiBar({
  itemCount,
  totalQuantity,
  lowCount,
  zeroCount,
  onSelectLow,
  onSelectZero,
}: {
  itemCount: number;
  totalQuantity: number;
  lowCount: number;
  zeroCount: number;
  onSelectLow: () => void;
  onSelectZero: () => void;
}) {
  return (
    <section className="mx-auto flex max-w-screen-2xl gap-4 px-6 py-4">
      <div className="flex h-[88px] flex-1 items-center gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 px-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300"><Boxes className="h-6 w-6" /></div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">총 운영 자산</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{formatQuantity(itemCount)}개 품목</p>
          <p className="text-sm text-slate-400">총 재고 {formatQuantity(totalQuantity)}개</p>
        </div>
      </div>
      <button type="button" onClick={onSelectLow} className="flex h-[88px] min-w-[240px] flex-1 items-center gap-4 rounded-3xl border border-amber-500/20 bg-slate-950/70 px-5 text-left transition hover:border-amber-400/40 hover:bg-slate-900">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300"><AlertTriangle className="h-6 w-6" /></div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">발주 주의</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{formatQuantity(lowCount)}개 품목</p>
          <p className="text-sm text-slate-400">안전재고 이하 품목</p>
        </div>
      </button>
      <button type="button" onClick={onSelectZero} className="flex h-[88px] min-w-[240px] flex-1 items-center gap-4 rounded-3xl border border-red-500/20 bg-slate-950/70 px-5 text-left transition hover:border-red-400/40 hover:bg-slate-900">
        <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-red-500/15 text-red-300"><ArchiveX className="h-6 w-6" /></div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300/80">생산 중단 위기</p>
          <p className="mt-1 text-xl font-semibold text-slate-50">{formatQuantity(zeroCount)}개 품목</p>
          <p className="text-sm text-slate-400">현재고 0 품목</p>
        </div>
      </button>
    </section>
  );
}

function InventoryPageInner() {
  const searchParams = useSearchParams();

  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "ALL">("ALL");
  const [stockFilter, setStockFilter] = useState<StockFilter>(() => {
    const f = searchParams.get("filter");
    if (f === "ZERO" || f === "SAFETY") return f;
    return "ALL";
  });
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mode, setMode] = useState<ActionMode>("ADJUST");
  const [editingMinStock, setEditingMinStock] = useState(false);
  const [minStockInput, setMinStockInput] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<Category>("RM");
  const deferredSearch = useDeferredValue(search);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const nextItems = await api.getItems({ limit: 2000 });
        nextItems.sort((a, b) => a.item_code.localeCompare(b.item_code));
        setItems(nextItems);
      } catch (error) {
        setFetchError(error instanceof Error ? error.message : "재고 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);
  // Auto-select item from ?item= URL param once items are loaded
  const itemIdParam = searchParams.get("item");
  useEffect(() => {
    if (!itemIdParam || items.length === 0) return;
    const target = items.find((i) => i.item_id === itemIdParam);
    if (target) setSelectedItem(target);
  }, [itemIdParam, items]);

  useEffect(() => {
    if (!selectedItem) {
      setTransactions([]);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);
    api
      .getTransactions({ itemId: selectedItem.item_id, limit: 10 })
      .then(setTransactions)
      .catch((error) => setDetailError(error instanceof Error ? error.message : "최근 이력을 불러오지 못했습니다."))
      .finally(() => setDetailLoading(false));
  }, [selectedItem?.item_id]);

  useEffect(() => {
    if (!selectedItem) {
      setQuantity("0");
      setReason("");
      setLocation("");
      setCategory("RM");
      return;
    }

    setLocation(selectedItem.location ?? "");
    setCategory(selectedItem.category);
    setReason("");
    setQuantity(mode === "ADJUST" ? String(Number(selectedItem.quantity)) : "1");
    setEditingMinStock(false);
  }, [selectedItem, mode]);

  const filteredItems = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      const qty = Number(item.quantity);
      const haystack = [item.item_code, item.item_name, item.spec ?? "", item.location ?? "", item.barcode ?? ""].join(" ").toLowerCase();
      const matchesCategory = categoryFilter === "ALL" || item.category === categoryFilter;
      const matchesKeyword = !keyword || haystack.includes(keyword);
      const minStock = item.min_stock ? Number(item.min_stock) : 10;
      const matchesStock =
        stockFilter === "ALL" ||
        (stockFilter === "SAFETY" && qty > 0 && qty < minStock) ||
        (stockFilter === "ZERO" && qty <= 0) ||
        (stockFilter === "UK_ONLY" && item.category === "UK");
      return matchesCategory && matchesKeyword && matchesStock;
    });
  }, [items, categoryFilter, deferredSearch, stockFilter]);

  const kpis = useMemo(() => ({
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity), 0),
    lowCount: items.filter((item) => {
      const qty = Number(item.quantity);
      const min = item.min_stock ? Number(item.min_stock) : 10;
      return qty > 0 && qty < min;
    }).length,
    zeroCount: items.filter((item) => Number(item.quantity) <= 0).length,
  }), [items]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedItem(null);
      setFocusedIndex(0);
      rowRefs.current = [];
      return;
    }

    const currentIndex = selectedItem ? filteredItems.findIndex((item) => item.item_id === selectedItem.item_id) : -1;
    if (currentIndex === -1) {
      setSelectedItem(filteredItems[0]);
      setFocusedIndex(0);
      return;
    }
    setFocusedIndex(currentIndex);
  }, [filteredItems, selectedItem]);

  const showToast = (message: string, type: "success" | "error") => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  const handleModeChange = (nextMode: ActionMode) => {
    setMode(nextMode);
    setDetailError(null);
    if (selectedItem) {
      setQuantity(nextMode === "ADJUST" ? String(Number(selectedItem.quantity)) : "1");
    }
  };

  const bumpQuantity = (delta: number) => {
    const current = Number(quantity || 0);
    const minimum = mode === "ADJUST" ? 0 : 1;
    setQuantity(String(Math.max(minimum, current + delta)));
  };

  const handleSave = async () => {
    if (!selectedItem) return;

    const nextQuantity = Number(quantity);
    const changedLocation = location !== (selectedItem.location ?? "");
    const changedCategory = category !== selectedItem.category;
    const changedQuantity = nextQuantity !== Number(selectedItem.quantity);

    if (Number.isNaN(nextQuantity) || nextQuantity < 0) {
      setDetailError("수량은 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    if (mode !== "ADJUST" && nextQuantity <= 0) {
      setDetailError("입고 및 출고 수량은 1 이상이어야 합니다.");
      return;
    }
    if (((mode === "ADJUST" && (changedQuantity || changedLocation)) || mode !== "ADJUST") && !reason.trim()) {
      setDetailError("처리 사유를 입력해 주세요.");
      return;
    }
    if (mode === "ADJUST" && !changedQuantity && !changedLocation && !changedCategory) {
      setDetailError("변경된 내용이 없습니다.");
      return;
    }

    try {
      setSaving(true);
      setDetailError(null);

      if (changedCategory) await api.updateItem(selectedItem.item_id, { category });
      if (mode === "ADJUST" && (changedQuantity || changedLocation)) {
        await api.adjustInventory({ item_id: selectedItem.item_id, quantity: nextQuantity, reason: reason.trim(), location: location.trim() || undefined });
      }
      if (mode === "RECEIVE") {
        await api.receiveInventory({ item_id: selectedItem.item_id, quantity: nextQuantity, location: location.trim() || selectedItem.location || undefined, notes: reason.trim() });
      }
      if (mode === "SHIP") {
        await api.shipInventory({ item_id: selectedItem.item_id, quantity: nextQuantity, location: location.trim() || selectedItem.location || undefined, notes: reason.trim() });
      }

      const latestItem = await api.getItem(selectedItem.item_id);
      const nextTransactions = await api.getTransactions({ itemId: selectedItem.item_id, limit: 10 });
      setItems((current) => current.map((item) => (item.item_id === latestItem.item_id ? latestItem : item)).sort((a, b) => a.item_code.localeCompare(b.item_code)));
      setSelectedItem(latestItem);
      setTransactions(nextTransactions);
      setReason("");
      setLocation(latestItem.location ?? "");
      setCategory(latestItem.category);
      setQuantity(mode === "ADJUST" ? String(Number(latestItem.quantity)) : "1");
      showToast("재고 정보가 저장되었습니다.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.";
      setDetailError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMinStock = async () => {
    if (!selectedItem) return;
    const value = Number(minStockInput);
    if (Number.isNaN(value) || value < 0) {
      showToast("안전재고는 0 이상의 숫자로 입력해 주세요.", "error");
      return;
    }
    try {
      const updated = await api.updateItem(selectedItem.item_id, { min_stock: value });
      setItems((current) => current.map((item) => (item.item_id === updated.item_id ? { ...item, min_stock: updated.min_stock } : item)));
      setSelectedItem((prev) => prev ? { ...prev, min_stock: updated.min_stock } : prev);
      setEditingMinStock(false);
      showToast("안전재고가 업데이트되었습니다.", "success");
    } catch {
      showToast("안전재고 저장에 실패했습니다.", "error");
    }
  };

  const handleKeyboardNavigation = (event: KeyboardEvent<HTMLDivElement>) => {
    if (filteredItems.length === 0) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.min(Math.max(focusedIndex + delta, 0), filteredItems.length - 1);
    setFocusedIndex(nextIndex);
    setSelectedItem(filteredItems[nextIndex]);
    rowRefs.current[nextIndex]?.scrollIntoView({ block: "nearest" });
  };

  const detailSummary = selectedItem
    ? `${selectedItem.item_name} / ${CATEGORY_LABELS[selectedItem.category]} / 현재고 ${formatQuantity(selectedItem.quantity)}`
    : "품목을 선택하면 상세 정보와 최근 이력을 확인할 수 있습니다.";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />
      <KpiBar
        itemCount={kpis.itemCount}
        totalQuantity={kpis.totalQuantity}
        lowCount={kpis.lowCount}
        zeroCount={kpis.zeroCount}
        onSelectLow={() => setStockFilter("SAFETY")}
        onSelectZero={() => setStockFilter("ZERO")}
      />

      <main className="mx-auto max-w-screen-2xl px-6 pb-8">
        <div className="grid h-[calc(100vh-152px)] grid-cols-[minmax(600px,1.5fr)_minmax(400px,1fr)] gap-4">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inventory Control</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-50">전체 품목 리스트</h2>
                </div>
                <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white">
                  <RotateCcw className="h-4 w-4" />새로고침
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="relative min-w-[280px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="품목명, 코드, 사양, 위치, 바코드 검색" className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500" />
                </label>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as Category | "ALL")} className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500">
                  {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <button type="button" onClick={() => setStockFilter("SAFETY")} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${stockFilter === "SAFETY" ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-white"}`}>발주 필요</button>
                <button type="button" onClick={() => setStockFilter("ZERO")} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${stockFilter === "ZERO" ? "border-red-400 bg-red-400/15 text-red-200" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-white"}`}>품절</button>
                <button type="button" onClick={() => { setSearch(""); setCategoryFilter("ALL"); setStockFilter("ALL"); }} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:text-white" aria-label="필터 초기화" title="필터 초기화"><RotateCcw className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 border-b border-slate-800 px-5 py-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">현재 표시 품목</p><p className="mt-2 text-2xl font-semibold text-slate-50">{formatQuantity(filteredItems.length)}</p></div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">현재 표시 재고</p><p className="mt-2 text-2xl font-semibold text-slate-50">{formatQuantity(filteredItems.reduce((sum, item) => sum + Number(item.quantity), 0))}</p></div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">발주 주의</p><p className="mt-2 text-2xl font-semibold text-amber-300">{formatQuantity(filteredItems.filter((item) => { const qty = Number(item.quantity); const min = item.min_stock ? Number(item.min_stock) : 10; return qty > 0 && qty < min; }).length)}</p></div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">품절</p><p className="mt-2 text-2xl font-semibold text-red-300">{formatQuantity(filteredItems.filter((item) => Number(item.quantity) <= 0).length)}</p></div>
            </div>

            <div tabIndex={0} onKeyDown={handleKeyboardNavigation} className="flex min-h-0 flex-1 flex-col outline-none">
              <div className="grid grid-cols-[130px_minmax(180px,1.2fr)_minmax(160px,1fr)_100px_minmax(180px,1.1fr)_120px_110px] border-b border-slate-800 bg-slate-900/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <span>코드</span><span>품목명</span><span>사양</span><span>카테고리</span><span>현재고 / 안전재고</span><span>공급사</span><span>위치</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? <div className="flex h-full items-center justify-center text-sm text-slate-400">재고 데이터를 불러오는 중입니다.</div> : fetchError ? <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">{fetchError}</div> : filteredItems.length === 0 ? <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">조건에 맞는 품목이 없습니다. 검색어 또는 필터를 조정해 주세요.</div> : filteredItems.map((item, index) => {
                  const statusMeta = getStatusMeta(Number(item.quantity), item.min_stock);
                  const isSelected = selectedItem?.item_id === item.item_id;
                  const qty = Number(item.quantity);
                  const minS = item.min_stock ? Number(item.min_stock) : null;
                  return (
                    <button key={item.item_id} ref={(node) => { rowRefs.current[index] = node; }} type="button" onClick={() => { setFocusedIndex(index); setSelectedItem(item); }} className={`grid w-full grid-cols-[130px_minmax(180px,1.2fr)_minmax(160px,1fr)_100px_minmax(180px,1.1fr)_120px_110px] items-center border-b border-slate-900 px-5 py-3 text-left transition ${isSelected ? "border-l-2 border-l-blue-500 bg-blue-900/30" : "border-l-2 border-l-transparent hover:bg-slate-900/70"}`}>
                      <span className="font-mono text-sm text-blue-300">{item.item_code}</span>
                      <span className="pr-4 text-sm font-medium text-slate-50">{item.item_name}</span>
                      <span className="pr-4 text-sm text-slate-400">{item.spec || "-"}</span>
                      <span className="text-sm text-slate-300">{CATEGORY_LABELS[item.category]}</span>
                      <span className="flex items-center gap-2 pr-2">
                        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusMeta.tone}`}><span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />{statusMeta.label}</span>
                        <span className="font-mono text-sm text-slate-100">{formatQuantity(qty)}{minS !== null ? <span className="text-slate-500"> / {formatQuantity(minS)}</span> : null} <span className="text-xs text-slate-500">{item.unit || "EA"}</span></span>
                      </span>
                      <span className="truncate pr-2 text-sm text-slate-400">{item.supplier || "—"}</span>
                      <span className="text-sm text-slate-400">{item.location || "-"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Detail Panel</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50">선택 품목 상세</h2>
              <p className="mt-2 text-sm text-slate-400">{detailSummary}</p>
            </div>
            {!selectedItem ? <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-500/10 text-blue-300"><PackageSearch className="h-9 w-9" /></div><h3 className="mt-5 text-lg font-semibold text-slate-100">품목을 선택해 주세요</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">좌측 테이블에서 품목을 선택하면 상세 정보와 재고 처리, 최근 거래 이력을 여기에서 바로 확인할 수 있습니다.</p></div> : <>
              <div className="border-b border-slate-800 px-5 py-5">
                <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-sm font-semibold text-blue-300">{selectedItem.item_code}</p><h3 className="mt-2 text-2xl font-bold text-slate-50">{selectedItem.item_name}</h3><p className="mt-2 text-sm text-slate-400">{selectedItem.spec || "사양 정보 없음"}</p>{selectedItem.supplier ? <p className="mt-1 text-xs text-slate-500">공급사: <span className="text-slate-300">{selectedItem.supplier}</span></p> : null}</div><span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200">{CATEGORY_LABELS[selectedItem.category]}</span></div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">현재고</p><p className="mt-2 text-3xl font-semibold text-slate-50">{formatQuantity(selectedItem.quantity)} <span className="text-base text-slate-500">{selectedItem.unit || "EA"}</span></p></div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">위치</p><p className="mt-2 text-sm font-medium text-slate-200">{selectedItem.location || "-"}</p></div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">안전재고</p>
                      {!editingMinStock && <button type="button" onClick={() => { setMinStockInput(selectedItem.min_stock ? String(Number(selectedItem.min_stock)) : ""); setEditingMinStock(true); }} className="text-slate-500 hover:text-slate-300" title="안전재고 편집"><Pencil className="h-3.5 w-3.5" /></button>}
                    </div>
                    {editingMinStock ? (
                      <div className="mt-2 flex items-center gap-1">
                        <input autoFocus value={minStockInput} onChange={(e) => setMinStockInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void handleSaveMinStock(); if (e.key === "Escape") setEditingMinStock(false); }} className="w-full rounded-lg border border-blue-500 bg-slate-950 px-2 py-1 text-sm text-slate-50 outline-none" inputMode="numeric" placeholder="0" />
                        <button type="button" onClick={() => void handleSaveMinStock()} className="shrink-0 rounded-lg bg-blue-500 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-400">저장</button>
                        <button type="button" onClick={() => setEditingMinStock(false)} className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-white">취소</button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm font-medium text-slate-200">{selectedItem.min_stock ? formatQuantity(selectedItem.min_stock) : "-"}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-800 px-5 py-5">
                <div className="flex gap-2">{[{ key: "ADJUST", label: "조정" }, { key: "RECEIVE", label: "입고" }, { key: "SHIP", label: "출고" }].map((option) => <button key={option.key} type="button" onClick={() => handleModeChange(option.key as ActionMode)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === option.key ? option.key === "SHIP" ? "bg-red-500 text-white" : "bg-blue-500 text-white" : "border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:text-white"}`}>{option.label}</button>)}</div>
                <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">처리 수량</p><div className="mt-3 flex items-center gap-3"><button type="button" onClick={() => bumpQuantity(-1)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-slate-500"><Minus className="h-4 w-4" /></button><input value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-14 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-center text-2xl font-semibold text-slate-50 outline-none transition focus:border-blue-500" inputMode="numeric" /><button type="button" onClick={() => bumpQuantity(1)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-slate-500"><Plus className="h-4 w-4" /></button></div></div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">처리 후 예상 재고</p><p className="mt-4 text-right text-2xl font-semibold text-slate-50">{formatQuantity(mode === "ADJUST" ? Number(quantity || 0) : mode === "RECEIVE" ? Number(selectedItem.quantity) + Number(quantity || 0) : Number(selectedItem.quantity) - Number(quantity || 0))}</p></div>
                </div>
                <div className="mt-4 grid gap-3">
                  <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="처리 사유를 입력해 주세요." className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500" />
                  <div className="grid grid-cols-2 gap-3"><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="위치를 입력하세요." className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500" /><select value={category} onChange={(event) => setCategory(event.target.value as Category)} className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500">{CATEGORY_OPTIONS.filter((option) => option.value !== "ALL").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-300"><p className="font-semibold text-slate-100">실행 요약</p><p className="mt-2 text-slate-400">{selectedItem.item_name} / {selectedItem.item_code} / {mode === "ADJUST" ? "조정" : mode === "RECEIVE" ? "입고" : "출고"} / 수량 {formatQuantity(quantity || 0)} / 위치 {location || selectedItem.location || "-"}</p></div>
                {detailError ? <p className="mt-4 text-sm text-red-300">{detailError}</p> : null}
                <button type="button" onClick={() => void handleSave()} disabled={saving} className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${mode === "SHIP" ? "bg-red-500 hover:bg-red-400 disabled:bg-red-500/40" : "bg-blue-500 hover:bg-blue-400 disabled:bg-blue-500/40"}`}><ArrowDownUp className="h-4 w-4" />{saving ? "저장 중..." : mode === "ADJUST" ? "재고 조정 적용" : mode === "RECEIVE" ? "입고 저장" : "출고 실행"}</button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-5 py-5"><div className="flex h-full min-h-0 flex-col rounded-3xl border border-slate-800 bg-slate-900/50"><div className="border-b border-slate-800 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">최근 거래 이력</p><p className="mt-1 text-sm text-slate-400">선택 품목 기준 최근 10건을 실시간으로 보여줍니다.</p></div><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{detailLoading ? <p className="text-sm text-slate-400">최근 이력을 불러오는 중입니다.</p> : detailError && transactions.length === 0 ? <p className="text-sm text-red-300">{detailError}</p> : transactions.length === 0 ? <p className="text-sm text-slate-400">표시할 최근 거래 이력이 없습니다.</p> : <div className="space-y-3">{transactions.map((log) => <div key={log.log_id} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200">{TX_TYPE_LABELS[log.transaction_type] ?? log.transaction_type}</span><span className="font-mono text-sm text-slate-300">{log.quantity_change > 0 ? "+" : ""}{formatQuantity(log.quantity_change)}</span></div><p className="mt-2 text-sm text-slate-200">{log.notes || "메모 없음"}</p><div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{log.produced_by || "담당자 없음"}</span><span>{new Date(log.created_at).toLocaleString()}</span></div></div>)}</div>}</div></div></div>
            </>}
          </aside>
        </div>
      </main>

      {toast ? <div className="fixed bottom-6 right-6 z-50"><div className={`rounded-2xl border px-5 py-4 shadow-2xl ${toast.type === "success" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-50" : "border-red-500/30 bg-red-500/15 text-red-50"}`}><p className="text-sm font-semibold">{toast.message}</p></div></div> : null}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryPageInner />
    </Suspense>
  );
}
