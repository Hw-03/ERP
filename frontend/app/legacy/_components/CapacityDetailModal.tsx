"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ShoppingCart, AlertCircle, CheckCircle2 } from "lucide-react";
import { productionApi } from "@/lib/api/production";
import type {
  ProductionCapacity,
  ProductionCapacityItem,
  ProductionCapacityStatus,
  ProductionCheckResponse,
} from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

type FilterMode = "producible" | "shortage" | "all";

/**
 * DesktopLegacyShell 의 생산 가능수량 상세 모달.
 * 사장님 시점 정보 디자인: 요약 헤더 · 쇼핑 리스트(병목 부품 집계) ·
 * 필터(생산 가능/부족/전체) · 시리즈 그룹 · 행 클릭 시 BOM 자식 펼침.
 */
export function CapacityDetailModal({
  capacityData,
  onClose,
}: {
  capacityData: ProductionCapacity | null;
  onClose: () => void;
}) {
  const status: ProductionCapacityStatus | null = capacityData
    ? capacityData.status ??
      (capacityData.top_items.length === 0
        ? "bom_not_registered"
        : capacityData.immediate > 0 || capacityData.maximum > 0
          ? "producible"
          : "not_producible")
    : null;

  const emptyMessage = (() => {
    if (capacityData == null) return "데이터를 불러오는 중…";
    switch (status) {
      case "no_target":
        return "생산 가능 품목이 없습니다. BOM/완제품 기준 확인 필요.";
      case "bom_not_registered":
        return "BOM이 등록되지 않아 생산 가능 수량을 계산할 수 없습니다.";
      case "not_producible":
        return "병목 부품 또는 재고 부족으로 현재 생산 가능 수량이 없습니다.";
      default:
        return "표시할 항목이 없습니다.";
    }
  })();

  const items = useMemo(
    () => capacityData?.top_items ?? [],
    [capacityData],
  );
  const hasItems = items.length > 0;

  // ── E: 요약 통계 ────────────────────────────────────────────
  const producibleCount = useMemo(
    () => items.filter((it) => it.immediate > 0).length,
    [items],
  );
  const shortageCount = items.length - producibleCount;

  // ── D: 쇼핑 리스트 — 병목 부품 집계 ──────────────────────────
  const shoppingList = useMemo(() => {
    const map = new Map<string, { count: number; pfs: string[] }>();
    for (const it of items) {
      const key = it.limiting_item?.trim();
      if (!key) continue;
      const e = map.get(key) ?? { count: 0, pfs: [] };
      e.count += 1;
      e.pfs.push(it.item_name);
      map.set(key, e);
    }
    return Array.from(map.entries())
      .map(([part, e]) => ({ part, count: e.count, pfs: e.pfs }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [items]);

  // ── B: 필터 토글 ────────────────────────────────────────────
  const [filterMode, setFilterMode] = useState<FilterMode>("producible");
  const filteredItems = useMemo(() => {
    if (filterMode === "producible") return items.filter((it) => it.immediate > 0);
    if (filterMode === "shortage") return items.filter((it) => it.immediate === 0);
    return items;
  }, [items, filterMode]);

  // ── C: 시리즈 그룹화 ────────────────────────────────────────
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ProductionCapacityItem[]>();
    for (const it of filteredItems) {
      const key = (it.item_name.split("_")[0] || "기타").trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    groups.forEach((arr) => {
      arr.sort((a, b) => b.immediate - a.immediate);
    });
    return Array.from(groups.entries())
      .map(([key, arr]) => ({
        key,
        items: arr,
        sumImm: arr.reduce((s, x) => s + x.immediate, 0),
        sumMax: arr.reduce((s, x) => s + x.maximum, 0),
      }))
      .sort((a, b) => b.sumImm - a.sumImm);
  }, [filteredItems]);

  // ── A: 행 클릭 → BOM 자식 펼침 (lazy fetch + cache) ──────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bomCache, setBomCache] = useState<Map<string, ProductionCheckResponse>>(new Map());
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function toggleExpand(itemId: string) {
    const isOpen = expandedIds.has(itemId);
    const next = new Set(expandedIds);
    if (isOpen) {
      next.delete(itemId);
      setExpandedIds(next);
      return;
    }
    next.add(itemId);
    setExpandedIds(next);
    if (!bomCache.has(itemId)) {
      setLoadingId(itemId);
      try {
        const data = await productionApi.checkProduction(itemId, 1);
        setBomCache((m) => new Map(m).set(itemId, data));
      } catch {
        // 무시 — 다시 클릭하면 재시도.
      } finally {
        setLoadingId((cur) => (cur === itemId ? null : cur));
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[min(1100px,94vw)] flex-col rounded-[28px] border"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          maxHeight: "min(900px, 92vh)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ───────────────────────────────────────── */}
        <div className="border-b px-7 pb-4 pt-7" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
            생산 가능수량 상세
          </div>
          <div className="mt-1 text-xs leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
            즉시: 중간재(공정 재고)를 활용해 빠르게 만들 수 있는 수량 · 최대: 하위 자재 전부 투입 시 이론치
          </div>
        </div>

        {/* ── 본문 (스크롤) ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-7 py-5">
          {hasItems ? (
            <>
              {/* E: 요약 헤더 — 즉시·최대·종류 통계 */}
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div
                  className="rounded-[18px] border p-4"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <div
                    className="text-xs font-bold uppercase tracking-[0.15em]"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    즉시 생산 합계
                  </div>
                  <div
                    className="mt-1 text-[28px] font-black leading-tight"
                    style={{ color: LEGACY_COLORS.cyan }}
                  >
                    {formatQty(capacityData!.immediate)}
                  </div>
                </div>
                <div
                  className="rounded-[18px] border p-4"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <div
                    className="text-xs font-bold uppercase tracking-[0.15em]"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    최대 생산 합계
                  </div>
                  <div
                    className="mt-1 text-[28px] font-black leading-tight"
                    style={{ color: LEGACY_COLORS.blue }}
                  >
                    {formatQty(capacityData!.maximum)}
                  </div>
                </div>
                <div
                  className="rounded-[18px] border p-4"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <div
                    className="text-xs font-bold uppercase tracking-[0.15em]"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    생산 가능 종류
                  </div>
                  <div className="mt-1 flex items-baseline gap-2 leading-tight">
                    <span
                      className="text-[28px] font-black"
                      style={{ color: LEGACY_COLORS.cyan }}
                    >
                      {producibleCount}
                    </span>
                    <span className="text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                      / {items.length}종
                    </span>
                  </div>
                  {/* 미니 게이지 */}
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,.05)" }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${items.length > 0 ? (producibleCount / items.length) * 100 : 0}%`,
                        background: LEGACY_COLORS.cyan,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* D: 쇼핑 리스트 — 병목 부품 집계 */}
              {shoppingList.length > 0 && (
                <div
                  className="mb-4 rounded-[18px] border p-4"
                  style={{
                    background: "rgba(255,136,0,.06)",
                    borderColor: "rgba(255,136,0,.25)",
                  }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" style={{ color: LEGACY_COLORS.yellow }} />
                    <span
                      className="text-sm font-bold"
                      style={{ color: LEGACY_COLORS.yellow }}
                    >
                      우선 발주 후보 — 이것만 들여오면 추가 생산 가능
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {shoppingList.map((s) => (
                      <div
                        key={s.part}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[10px] px-3 py-2"
                        style={{ background: "rgba(255,255,255,.03)" }}
                      >
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-semibold"
                            style={{ color: LEGACY_COLORS.text }}
                          >
                            {s.part}
                          </div>
                          <div
                            className="truncate text-xs"
                            style={{ color: LEGACY_COLORS.muted2 }}
                          >
                            영향 PF: {s.pfs.slice(0, 2).join(", ")}
                            {s.pfs.length > 2 ? ` 외 ${s.pfs.length - 2}종` : ""}
                          </div>
                        </div>
                        <div
                          className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{
                            background: "rgba(255,136,0,.18)",
                            color: LEGACY_COLORS.yellow,
                          }}
                        >
                          +{s.count}종 생산 가능
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* B: 필터 토글 */}
              <div className="mb-3 flex items-center gap-2">
                {(
                  [
                    { key: "producible", label: "만들 수 있는 것", count: producibleCount, color: LEGACY_COLORS.cyan },
                    { key: "shortage", label: "부족한 것", count: shortageCount, color: LEGACY_COLORS.yellow },
                    { key: "all", label: "전체", count: items.length, color: LEGACY_COLORS.muted2 },
                  ] as { key: FilterMode; label: string; count: number; color: string }[]
                ).map((f) => {
                  const active = filterMode === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setFilterMode(f.key)}
                      className="rounded-full border px-3 py-1.5 text-xs font-bold transition-opacity"
                      style={{
                        background: active ? `color-mix(in srgb, ${f.color} 18%, transparent)` : "transparent",
                        borderColor: active ? f.color : LEGACY_COLORS.border,
                        color: active ? f.color : LEGACY_COLORS.muted2,
                      }}
                    >
                      {f.label} <span className="ml-1 opacity-70">{f.count}</span>
                    </button>
                  );
                })}
              </div>

              {/* C+A: 시리즈 그룹 + 행 클릭 펼침 */}
              <div
                className="rounded-[16px] border"
                style={{ borderColor: LEGACY_COLORS.border }}
              >
                <div
                  className="grid grid-cols-[24px_1fr_120px_120px] border-b px-4 py-2 text-xs font-bold uppercase tracking-[0.15em]"
                  style={{
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  <span />
                  <span>품목 · 병목</span>
                  <span className="text-right">즉시</span>
                  <span className="text-right">최대</span>
                </div>

                {groupedItems.length === 0 && (
                  <div
                    className="px-4 py-6 text-center text-sm"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    조건에 맞는 PF가 없습니다.
                  </div>
                )}

                {groupedItems.map((group) => (
                  <div key={group.key}>
                    {/* 시리즈 헤더 */}
                    <div
                      className="grid grid-cols-[24px_1fr_120px_120px] items-center border-t px-4 py-2"
                      style={{
                        borderColor: LEGACY_COLORS.border,
                        background: "rgba(101,169,255,.05)",
                      }}
                    >
                      <span />
                      <span
                        className="text-sm font-black"
                        style={{ color: LEGACY_COLORS.blue }}
                      >
                        {group.key}{" "}
                        <span
                          className="text-xs font-bold"
                          style={{ color: LEGACY_COLORS.muted2 }}
                        >
                          · {group.items.length}종
                        </span>
                      </span>
                      <span
                        className="text-right text-xs font-bold"
                        style={{ color: LEGACY_COLORS.cyan }}
                      >
                        {formatQty(group.sumImm)}
                      </span>
                      <span
                        className="text-right text-xs"
                        style={{ color: LEGACY_COLORS.muted2 }}
                      >
                        {formatQty(group.sumMax)}
                      </span>
                    </div>

                    {/* 그룹 내부 PF 행 */}
                    {group.items.map((item) => {
                      const expanded = expandedIds.has(item.item_id);
                      const bom = bomCache.get(item.item_id);
                      const loading = loadingId === item.item_id;
                      return (
                        <div key={item.item_id}>
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.item_id)}
                            className="grid w-full cursor-pointer grid-cols-[24px_1fr_120px_120px] items-center border-t px-4 py-2.5 text-left transition-colors hover:brightness-110"
                            style={{ borderColor: LEGACY_COLORS.border }}
                          >
                            {expanded ? (
                              <ChevronDown
                                className="h-4 w-4"
                                style={{ color: LEGACY_COLORS.blue }}
                              />
                            ) : (
                              <ChevronRight
                                className="h-4 w-4"
                                style={{ color: LEGACY_COLORS.muted2 }}
                              />
                            )}
                            <div className="min-w-0 pr-2">
                              <div
                                className="truncate text-sm"
                                style={{ color: LEGACY_COLORS.text }}
                              >
                                {item.item_name}
                              </div>
                              {item.limiting_item && (
                                <div
                                  className="truncate text-xs"
                                  style={{ color: LEGACY_COLORS.yellow }}
                                >
                                  병목: {item.limiting_item}
                                </div>
                              )}
                            </div>
                            <div
                              className="text-right text-sm font-bold"
                              style={{
                                color:
                                  item.immediate > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2,
                              }}
                            >
                              {formatQty(item.immediate)}
                            </div>
                            <div
                              className="text-right text-sm"
                              style={{ color: LEGACY_COLORS.blue }}
                            >
                              {formatQty(item.maximum)}
                            </div>
                          </button>

                          {/* A: BOM 펼침 영역 */}
                          {expanded && (
                            <div
                              className="border-t px-5 py-3"
                              style={{
                                borderColor: LEGACY_COLORS.border,
                                background: "rgba(255,255,255,.02)",
                              }}
                            >
                              {loading && (
                                <div
                                  className="text-xs"
                                  style={{ color: LEGACY_COLORS.muted2 }}
                                >
                                  자재 정보 불러오는 중…
                                </div>
                              )}
                              {!loading && bom && (
                                <BomChildren bom={bom} />
                              )}
                              {!loading && !bom && (
                                <div
                                  className="text-xs"
                                  style={{ color: LEGACY_COLORS.muted2 }}
                                >
                                  자재 정보를 불러올 수 없습니다.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              {emptyMessage}
            </div>
          )}
        </div>

        {/* ── 푸터 ───────────────────────────────────────── */}
        <div
          className="border-t px-7 py-4"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <button
            className="w-full rounded-[18px] border py-3 text-base font-semibold"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
            }}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function BomChildren({ bom }: { bom: ProductionCheckResponse }) {
  if (bom.components.length === 0) {
    return (
      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        등록된 자재가 없습니다. BOM 미등록 가능성.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div
        className="grid grid-cols-[1fr_70px_70px_70px_28px] gap-2 px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.15em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        <span>자재</span>
        <span className="text-right">필요</span>
        <span className="text-right">현재</span>
        <span className="text-right">부족</span>
        <span />
      </div>
      {bom.components.map((c, i) => (
        <div
          key={`${c.item_code ?? c.item_name}-${i}`}
          className="grid grid-cols-[1fr_70px_70px_70px_28px] items-center gap-2 rounded-[8px] px-2 py-1.5"
          style={{
            background: c.ok ? "rgba(101,169,255,.04)" : "rgba(255,75,75,.08)",
          }}
        >
          <div className="min-w-0">
            <div
              className="truncate text-xs"
              style={{ color: LEGACY_COLORS.text }}
            >
              {c.item_name}
            </div>
            {c.item_code && (
              <div
                className="truncate text-[10px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {c.item_code}
              </div>
            )}
          </div>
          <div className="text-right text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {formatQty(c.required)}
          </div>
          <div className="text-right text-xs" style={{ color: LEGACY_COLORS.text }}>
            {formatQty(c.current_stock)}
          </div>
          <div
            className="text-right text-xs font-bold"
            style={{
              color: c.shortage > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
            }}
          >
            {c.shortage > 0 ? `−${formatQty(c.shortage)}` : "0"}
          </div>
          <div className="flex justify-end">
            {c.ok ? (
              <CheckCircle2
                className="h-3.5 w-3.5"
                style={{ color: LEGACY_COLORS.green }}
              />
            ) : (
              <AlertCircle
                className="h-3.5 w-3.5"
                style={{ color: LEGACY_COLORS.red }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
