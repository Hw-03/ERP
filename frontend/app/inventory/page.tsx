"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Minus,
  PackageSearch,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { api, type Category, type Item } from "@/lib/api";

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
  onSaved: (itemId: string, quantity: number, location: string | null) => void;
}) {
  const [quantity, setQuantity] = useState("0");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setQuantity(String(Number(item.quantity)));
    setReason("");
    setLocation(item.location ?? "");
    setError(null);
  }, [item]);

  if (!item) return null;

  const bumpQuantity = (delta: number) => {
    const current = Number(quantity || 0);
    const next = Math.max(0, current + delta);
    setQuantity(String(next));
  };

  const handleSave = async () => {
    const nextQuantity = Number(quantity);

    if (Number.isNaN(nextQuantity) || nextQuantity < 0) {
      setError("수량은 0 이상의 숫자로 입력해 주세요.");
      return;
    }

    if (!reason.trim()) {
      setError("조정 사유를 입력해 주세요.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await api.adjustInventory({
        item_id: item.item_id,
        quantity: nextQuantity,
        reason,
        location: location || undefined,
      });

      onSaved(item.item_id, Number(response.quantity), response.location);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? `재고 조정 실패: ${err.message}` : "재고 조정에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[28px] border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-5">
          <div>
            <p className="font-mono text-xs text-blue-400">{item.item_code}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-100">{item.item_name}</h2>
            <p className="mt-2 text-sm text-slate-400">
              카테고리 {item.category} · 단위 {item.unit}
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

        <div className="grid gap-4 px-6 py-5 md:grid-cols-[1.1fr,0.9fr]">
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                사용 가이드
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-400">
                <li>현재 화면은 레거시 `inventory_v2.html`의 즉시 조정 흐름을 현재 ERP에 이식한 화면입니다.</li>
                <li>수량은 절대값 기준으로 저장됩니다. 입력한 수량이 최종 현재고가 됩니다.</li>
                <li>조정 사유는 거래 이력에 함께 남습니다.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              재고 조정
            </p>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs text-slate-500">최종 수량</p>
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
                <span className="mb-2 block text-xs text-slate-500">조정 사유</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="예: 실사 반영, 분실 처리, 위치 정정"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
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
              {saving ? "저장 중..." : "재고 조정 저장"}
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
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");

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
        item.category,
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

  const handleSaved = (itemId: string, quantity: number, location: string | null) => {
    const updatedAt = new Date().toISOString();

    setItems((current) =>
      current.map((item) =>
        item.item_id === itemId
          ? { ...item, quantity, location, updated_at: updatedAt }
          : item,
      ),
    );

    setSelectedItem((current) =>
      current && current.item_id === itemId
        ? { ...current, quantity, location, updated_at: updatedAt }
        : current,
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드
          </Link>
        </div>

        <section className="mb-8 rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Warehouse Inventory
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight">전체 품목 리스트</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                이전 버전 `inventory_v2.html`의 어두운 리스트 레이아웃과 빠른 검색 흐름을
                현재 Next.js ERP 구조로 이식했습니다. 971개 부품을 실시간으로 검색하고
                카테고리별로 좁혀 보며, 상세 모달에서 바로 재고를 조정할 수 있습니다.
              </p>
            </div>

            <div className="grid min-w-[320px] gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  표시 품목 수
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-100">{totals.count}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  표시 재고 합계
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
              <span>레거시 스타일 필터</span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <CategoryPills value={selectedCategory} onChange={setSelectedCategory} />
            <StockPills value={stockFilter} onChange={setStockFilter} />
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-10 text-center text-sm text-slate-400">
            품목 데이터를 불러오는 중입니다.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[24px] border border-slate-800 bg-slate-900/60 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Inventory Table
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  행을 클릭하면 상세 정보와 재고 조정 폼이 열립니다.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-400">
                <PackageSearch className="h-4 w-4" />
                실시간 필터링
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
                  <tr className="border-b border-slate-800">
                    <th className="px-5 py-3 text-left text-slate-500">품목코드</th>
                    <th className="px-5 py-3 text-left text-slate-500">품목명</th>
                    <th className="px-5 py-3 text-left text-slate-500">사양</th>
                    <th className="px-5 py-3 text-left text-slate-500">카테고리</th>
                    <th className="px-5 py-3 text-left text-slate-500">위치</th>
                    <th className="px-5 py-3 text-right text-slate-500">현재고</th>
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
                          {item.category}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-400">{item.location || "-"}</td>
                      <td className="px-5 py-4 text-right font-mono text-cyan-300">
                        {formatQuantity(item.quantity)}
                      </td>
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
