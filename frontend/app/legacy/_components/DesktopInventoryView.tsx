"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

const DESKTOP_PAGE_SIZE = 100;
import { PackageSearch, Search, Sparkles, TrendingUp } from "lucide-react";
import { api, type Item, type TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  LEGACY_COLORS,
  LEGACY_MODELS,
  employeeColor,
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
];

type KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO";

const KPI_OPTIONS: { key: KpiFilter; label: string; tone: string }[] = [
  { key: "ALL", label: "전체", tone: LEGACY_COLORS.blue },
  { key: "NORMAL", label: "정상", tone: LEGACY_COLORS.green },
  { key: "LOW", label: "부족", tone: LEGACY_COLORS.yellow },
  { key: "ZERO", label: "품절", tone: LEGACY_COLORS.red },
];

function getMinStock(item: Item) {
  return item.min_stock == null ? 10 : Number(item.min_stock);
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

function matchesKpi(item: Item, kpi: KpiFilter) {
  const qty = Number(item.quantity);
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
  fluid,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone: string;
  fluid?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        fluid
          ? "rounded-full border px-4 py-2.5 text-sm font-semibold transition-all hover:brightness-110 text-center"
          : "rounded-full border px-4 py-2.5 text-sm font-semibold transition-all hover:brightness-110"
      }
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
  const [dept, setDept] = useState("ALL");
  const [model, setModel] = useState("전체");
  const [kpi, setKpi] = useState<KpiFilter>("ALL");
  const [localSearch, setLocalSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(DESKTOP_PAGE_SIZE);
  const [capacityModal, setCapacityModal] = useState(false);
  const [hoveredKpi, setHoveredKpi] = useState<KpiFilter | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const deferredLocalSearch = useDeferredValue(localSearch.trim().toLowerCase());

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);
      const nextItems = await api.getItems({
        limit: 2000,
        search: globalSearch.trim() || undefined,
        department: dept === "ALL" ? undefined : dept,
        legacyModel: model === "전체" ? undefined : model,
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

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearch, dept, model]);

  useEffect(() => {
    if (!selectedItem) {
      setItemLogs([]);
      return;
    }
    void api.getTransactions({ itemId: selectedItem.item_id, limit: 10 }).then(setItemLogs).catch(() => setItemLogs([]));
  }, [selectedItem]);

const scopedItems = useMemo(() => items.filter((item) => matchesSearch(item, deferredLocalSearch)), [items, deferredLocalSearch]);
  const filteredItems = useMemo(() => scopedItems.filter((item) => matchesKpi(item, kpi)), [scopedItems, kpi]);

  useEffect(() => {
    setDisplayLimit(DESKTOP_PAGE_SIZE);
  }, [filteredItems]);

  const summary = useMemo(() => {
    const totalQuantity = scopedItems.reduce((acc, item) => acc + Number(item.quantity), 0);
    const normalCount = scopedItems.filter((item) => Number(item.quantity) > 0 && Number(item.quantity) >= getMinStock(item)).length;
    const lowCount = scopedItems.filter((item) => Number(item.quantity) > 0 && Number(item.quantity) < getMinStock(item)).length;
    const zeroCount = scopedItems.filter((item) => Number(item.quantity) <= 0).length;
    return { totalCount: scopedItems.length, totalQuantity, normalCount, lowCount, zeroCount };
  }, [scopedItems]);

  const isFiltered = dept !== "ALL" || model !== "전체";


  return (
    <>
    {capacityModal && (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,.55)" }}
        onClick={() => setCapacityModal(false)}
      >
        <div
          className="w-full max-w-[380px] rounded-[28px] border p-7"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 text-base font-black" style={{ color: LEGACY_COLORS.text }}>준비 중</div>
          <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
            BOM 등록이 완료된 후 실수치가 연결됩니다.
          </div>
          <button
            className="mt-6 w-full rounded-[18px] border py-3 text-base font-semibold"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            onClick={() => setCapacityModal(false)}
          >
            확인
          </button>
        </div>
      </div>
    )}
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4">
      {/* ── 좌측: 스크롤 컨테이너 ── */}
      <div ref={scrollRef} className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}>
        <div className="flex flex-col gap-3 pb-6">

          {/* ── 검색+KPI+필터 섹션 ── */}
          <section className="card">
              {/* KPI 카드 */}
              <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: isFiltered ? "조회 품목" : "전체 품목", value: summary.totalCount, hint: isFiltered ? "필터 적용 결과" : `총 재고 ${formatNumber(summary.totalQuantity)}`, tone: LEGACY_COLORS.blue, key: "ALL" as KpiFilter },
                  { label: "정상", value: summary.normalCount, hint: "운영 가능 품목", tone: LEGACY_COLORS.green, key: "NORMAL" as KpiFilter },
                  { label: "부족", value: summary.lowCount, hint: "안전재고 이하", tone: LEGACY_COLORS.yellow, key: "LOW" as KpiFilter },
                  { label: "품절", value: summary.zeroCount, hint: "즉시 확인 필요", tone: LEGACY_COLORS.red, key: "ZERO" as KpiFilter },
                ].map((card) => (
                  <button
                    key={card.key}
                    onClick={() => setKpi(card.key)}
                    onMouseEnter={() => setHoveredKpi(card.key)}
                    onMouseLeave={() => setHoveredKpi(null)}
                    className="rounded-[20px] border px-4 py-4 text-left transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5"
                    style={{
                      background: hoveredKpi === card.key
                        ? `color-mix(in srgb, ${card.tone} var(--kpi-hover-mix, 28%), transparent)`
                        : kpi === card.key
                        ? `color-mix(in srgb, ${card.tone} 22%, transparent)`
                        : `color-mix(in srgb, ${card.tone} 10%, transparent)`,
                      borderColor: hoveredKpi === card.key || kpi === card.key
                        ? card.tone
                        : `color-mix(in srgb, ${card.tone} 40%, transparent)`,
                      boxShadow: hoveredKpi === card.key
                        ? `0 8px 20px rgba(0,0,0,0.35), 0 0 var(--kpi-glow-blur, 20px) color-mix(in srgb, ${card.tone} var(--kpi-glow-strength, 0%), transparent), inset 0 0 0 1px color-mix(in srgb, ${card.tone} var(--kpi-glow-strength, 0%), transparent)`
                        : undefined,
                    }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {card.label}
                    </div>
                    <div className="mt-2.5 font-mono text-[30px] font-black leading-none" style={{ color: card.tone }}>
                      {formatNumber(card.value)}
                    </div>
                    <div className="mt-2 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {card.hint}
                    </div>
                  </button>
                ))}
              </div>

              {/* 필터 */}
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                <div className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="mb-3 flex items-center gap-2 text-base font-bold">
                    <Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />
                    부서 구분
                  </div>
                  <div className="flex justify-between">
                    {DEPT_OPTIONS.map((opt) => (
                      <Chip key={opt.value} active={dept === opt.value} label={opt.label} onClick={() => setDept(opt.value)} tone={LEGACY_COLORS.green} fluid />
                    ))}
                  </div>
                </div>

                <div className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="mb-3 flex items-center gap-2 text-base font-bold">
                    <TrendingUp className="h-4 w-4" style={{ color: LEGACY_COLORS.cyan }} />
                    모델 구분
                  </div>
                  <div className="flex justify-between">
                    {LEGACY_MODELS.map((entry) => (
                      <Chip key={entry} active={model === entry} label={entry} onClick={() => setModel(entry)} tone={LEGACY_COLORS.cyan} fluid />
                    ))}
                  </div>
                </div>
              </div>

              {/* 생산 가능수량 버튼 */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  className="rounded-[20px] border px-4 py-4 text-left transition-colors hover:bg-white/[0.12]"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                  onClick={() => setCapacityModal(true)}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                    즉시 생산 가능수량
                  </div>
                  <div className="mt-2 font-mono text-[24px] font-black leading-none" style={{ color: LEGACY_COLORS.cyan }}>
                    —
                  </div>
                  <div className="mt-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    현 재고로 즉시 생산 가능한 수량
                  </div>
                </button>

                <button
                  className="rounded-[20px] border px-4 py-4 text-left transition-colors hover:bg-white/[0.12]"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                  onClick={() => setCapacityModal(true)}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                    최대 생산 가능수량
                  </div>
                  <div className="mt-2 font-mono text-[24px] font-black leading-none" style={{ color: LEGACY_COLORS.blue }}>
                    —
                  </div>
                  <div className="mt-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    전체 BOM 기준 최대 생산 가능 수량
                  </div>
                </button>
              </div>
            </section>

          {/* ── 재고 테이블 ── */}
          <section className="card" style={{ backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))" }}>
            {/* sticky 헤더: 자재 목록 제목 + 검색 + KPI 필터 */}
            <div
              className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-[28px] px-5 pb-3 pt-5"
              style={{ background: LEGACY_COLORS.bg, backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))" }}
            >
              <div className="shrink-0 text-base font-bold" style={{ color: LEGACY_COLORS.text }}>자재 목록</div>
              <div className="flex flex-1 items-center gap-2 rounded-[14px] border px-3 py-2" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                <input
                  value={localSearch}
                  onChange={(event) => setLocalSearch(event.target.value)}
                  placeholder="품목명, 코드, 위치, 공급처 검색"
                  className="flex-1 bg-transparent text-base outline-none"
                  style={{ color: LEGACY_COLORS.text }}
                />
                <span className="shrink-0 font-mono text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {formatNumber(filteredItems.length)}
                </span>
              </div>
            </div>

            {error ? (
              <div className="rounded-[24px] border px-4 py-4 text-base" style={{ borderColor: "rgba(255,123,123,.26)", background: "rgba(255,123,123,.08)", color: LEGACY_COLORS.red }}>
                {error}
              </div>
            ) : loading ? (
              <div className="rounded-[24px] border px-4 py-4 text-base" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}>
                재고 데이터를 불러오는 중입니다...
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: LEGACY_COLORS.s2 }}>
                      {([
                        { label: "상태", nowrap: true, width: "80px" },
                        { label: "품목명", nowrap: false, minWidth: "180px" },
                        { label: "ERP코드", nowrap: true, width: "88px" },
                        { label: "부서", nowrap: true, width: "120px" },
                        { label: "현재고", nowrap: true, width: "72px" },
                        { label: "안전재고", nowrap: true, width: "72px" },
                      ] as { label: string; nowrap: boolean; width?: string; minWidth?: string }[]).map(({ label, nowrap, width, minWidth }) => (
                        <th key={label} className={`border-b px-4 py-3 text-left text-[11px] font-bold${nowrap ? " whitespace-nowrap" : ""}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width, minWidth }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.slice(0, displayLimit).map((item) => {
                      const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
                      const selected = selectedItem?.item_id === item.item_id;
                      const py = "py-3";
                      return (
                        <tr
                          key={item.item_id}
                          onClick={() => setSelectedItem((current) => (current?.item_id === item.item_id ? null : item))}
                          className="cursor-pointer transition-colors hover:bg-white/[0.12]"
                          style={{ background: selected ? "rgba(101,169,255,.08)" : "transparent" }}
                        >
                          <td className={`border-b px-4 ${py} align-middle whitespace-nowrap`} style={{ borderColor: LEGACY_COLORS.border }}>
                            <span className="inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: stock.color, background: `${stock.color}20` }}>
                              {stock.label}
                            </span>
                          </td>
                          <td className={`border-b px-4 ${py} align-middle`} style={{ borderColor: LEGACY_COLORS.border }}>
                            <div className="font-semibold">{item.item_name}</div>
                            <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                              {item.spec || "-"}
                            </div>
                            {(() => {
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
                                segments.push({ pct, color: employeeColor(loc.department), label: `${loc.department} ${formatNumber(loc.quantity)}` });
                                used += pct;
                              }
                              return (
                                <div
                                  className="mt-2 flex h-[5px] overflow-hidden rounded-full"
                                  style={{ background: LEGACY_COLORS.s3 }}
                                  title={segments.map((s) => s.label).join(" / ")}
                                >
                                  {segments.map((s, i) => (
                                    <div key={i} className="h-full shrink-0" style={{ width: `${s.pct}%`, background: s.color }} />
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                          <td className={`border-b px-4 ${py} align-middle whitespace-nowrap font-mono text-[12px] font-bold`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}>
                            {item.erp_code ?? "-"}
                          </td>
                          <td className={`border-b px-4 ${py} align-middle`} style={{ borderColor: LEGACY_COLORS.border }}>
                            <div className="flex flex-wrap gap-1">
                              {Number(item.warehouse_qty) > 0 && (
                                <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ color: "#3ac4b0" }}>창고</span>
                              )}
                              {item.locations.filter((l) => Number(l.quantity) > 0).map((l) => (
                                <span key={l.department} className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ color: employeeColor(l.department) }}>
                                  {l.department}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className={`border-b px-4 ${py} text-right align-middle whitespace-nowrap font-mono text-[13px] font-bold`} style={{ borderColor: LEGACY_COLORS.border }}>
                            {formatNumber(item.quantity)}
                          </td>
                          <td className={`border-b px-4 ${py} text-right align-middle whitespace-nowrap font-mono text-[13px]`} style={{ borderColor: LEGACY_COLORS.border }}>
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
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              >
                100개 더 보기 ({formatNumber(Math.min(displayLimit + DESKTOP_PAGE_SIZE, filteredItems.length))} / {formatNumber(filteredItems.length)})
              </button>
            )}
            {filteredItems.length > 0 && (
              <div className="mt-2 text-center text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
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
      >
        {!selectedItem ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[28px] border p-8 text-center" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="rounded-3xl p-5" style={{ background: "rgba(101,169,255,.12)", color: LEGACY_COLORS.blue }}>
              <PackageSearch className="h-7 w-7" />
            </div>
            <div className="text-base font-bold">선택된 품목이 없습니다.</div>
            <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              목록에서 품목을 선택하세요.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 재고 상태 배지 */}
            {(() => {
              const stock = getStockState(Number(selectedItem.quantity), selectedItem.min_stock == null ? null : Number(selectedItem.min_stock));
              return (
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full px-3 py-1 text-base font-bold" style={{ color: stock.color, background: `${stock.color}20` }}>
                    {stock.label}
                  </span>
                </div>
              );
            })()}

            {/* 품목 정보 */}
            <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                품목 정보
              </div>
              <div className="grid gap-3 text-base">
                {selectedItem.erp_code && (
                  <div className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                    <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>ERP 코드</div>
                    <div className="mt-1 font-mono text-base font-bold" style={{ color: LEGACY_COLORS.blue }}>{selectedItem.erp_code}</div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                    <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>현재고</div>
                    <div className="mt-1 font-mono text-xl font-black">{formatNumber(selectedItem.quantity)}</div>
                  </div>
                  <div className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                    <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>안전재고</div>
                    <div className="mt-1 font-mono text-xl font-black">{selectedItem.min_stock == null ? "-" : formatNumber(selectedItem.min_stock)}</div>
                  </div>
                </div>
                <div className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                  <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>모델</div>
                  <div className="mt-1 text-base">{normalizeModel(selectedItem.legacy_model)}</div>
                </div>
                {(selectedItem.unit || selectedItem.supplier) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                      <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>단위</div>
                      <div className="mt-1 text-base">{selectedItem.unit || "-"}</div>
                    </div>
                    <div className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                      <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>공급처</div>
                      <div className="mt-1 text-sm truncate">{selectedItem.supplier || "-"}</div>
                    </div>
                  </div>
                )}
                {selectedItem.spec && (
                  <div className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                    <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>스펙</div>
                    <div className="mt-1 text-base">{selectedItem.spec}</div>
                  </div>
                )}
              </div>
            </section>

            {/* 위치별 재고 */}
            {(Number(selectedItem.warehouse_qty) > 0 || (selectedItem.locations ?? []).some((l) => Number(l.quantity) > 0)) && (
              <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  위치별 재고
                </div>
                <div className="space-y-2">
                  {Number(selectedItem.warehouse_qty) > 0 && (
                    <div className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                      <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.muted2 }} />
                      <span className="flex-1 text-base font-semibold">창고</span>
                      <span className="font-mono text-base font-bold" style={{ color: LEGACY_COLORS.text }}>{formatNumber(selectedItem.warehouse_qty)}</span>
                    </div>
                  )}
                  {(selectedItem.locations ?? []).filter((l) => Number(l.quantity) > 0).map((l) => (
                    <div key={l.department} className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                      <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: employeeColor(l.department) }} />
                      <span className="flex-1 text-base font-semibold">{l.department}</span>
                      <span className="font-mono text-base font-bold" style={{ color: LEGACY_COLORS.text }}>{formatNumber(l.quantity)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 입출고 이동 버튼 */}
            <button
              onClick={() => onGoToWarehouse(selectedItem)}
              className="w-full rounded-[18px] px-4 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: LEGACY_COLORS.blue }}
            >
              입출고 진행
            </button>

            {/* 최근 이력 */}
            <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                최근 이력
              </div>
              <div className="space-y-2">
                {itemLogs.length === 0 ? (
                  <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
                    최근 거래 이력이 없습니다.
                  </div>
                ) : (
                  itemLogs.map((log) => (
                    <div key={log.log_id} className="rounded-[18px] border p-3" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                          {transactionLabel(log.transaction_type)}
                        </span>
                        <span className="font-mono text-sm">{formatNumber(log.quantity_change)}</span>
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {log.notes || "메모 없음"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </DesktopRightPanel>
    </div>
    </>
  );
}
