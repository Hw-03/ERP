"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ShoppingCart, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { productionApi } from "@/lib/api/production";
import type {
  ProductionCapacity,
  ProductionCapacityItem,
  ProductionCapacityStatus,
  ProductionCheckResponse,
} from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { getModelLabel } from "@/lib/mes/model-labels";

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
  const representativeItems = useMemo(
    () => capacityData?.representative_items ?? [],
    [capacityData],
  );
  const hasItems = items.length > 0;

  // ── E: 요약 통계 ────────────────────────────────────────────
  const producibleCount = useMemo(
    () => items.filter((it) => it.immediate > 0).length,
    [items],
  );
  const shortageCount = items.length - producibleCount;

  // ── D: 공유 자재 — 병목 부품을 N종 PF가 공유하는 시각으로 집계 ──
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

  // ── C: 모델 단위 그룹화 (model_symbol). 없으면 "미분류".
  // 표시 라벨은 그룹 내 대표 PF (없으면 첫 PF) 의 시리즈명 사용.
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ProductionCapacityItem[]>();
    for (const it of filteredItems) {
      const key = (it.model_symbol ?? "").trim() || "미분류";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    groups.forEach((arr) => {
      arr.sort((a, b) => b.immediate - a.immediate);
    });
    return Array.from(groups.entries())
      .map(([key, arr]) => {
        const rep = arr.find((x) => x.is_representative) ?? arr[0];
        const label =
          key === "미분류"
            ? key
            : getModelLabel(key, rep?.item_name) || `모델${key}`;
        return { key, label, items: arr };
      })
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
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
            즉시: 중간재(공정 재고) 활용 · 최대: 하위 자재 전부 투입 시 이론치
          </div>
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 14%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            <AlertTriangle className="h-3 w-3" />
            각 PF 수치는 단독 가정 · 같은 자재 공유 PF 가 있어 동시에 다 못 만듦
          </div>
        </div>

        {/* ── 본문 (스크롤) ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-7 py-5">
          {hasItems ? (
            <>
              {/* E: 모델별 대표 PF 요약 — 메인 패널과 같은 정보 */}
              {representativeItems.length > 0 ? (
                <div
                  className="mb-4 rounded-[18px] border p-3"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
                >
                  <div
                    className="mb-2 text-xs font-bold uppercase tracking-[0.15em]"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    모델별 대표 PF — 즉시 / 최대
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {representativeItems.map((rep) => {
                      const isZero = rep.immediate === 0;
                      return (
                        <div
                          key={rep.item_id}
                          className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 rounded-[10px] px-2.5 py-1.5"
                          style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.text} 4%, transparent)` }}
                        >
                          <span
                            className="text-sm font-black"
                            style={{ color: LEGACY_COLORS.blue }}
                          >
                            {getModelLabel(rep.model_symbol, rep.item_name) || rep.item_name}
                          </span>
                          <span
                            className="truncate text-[11px]"
                            style={{ color: LEGACY_COLORS.muted2 }}
                            title={rep.item_name}
                          >
                            {rep.item_name}
                          </span>
                          <span className="inline-flex items-baseline gap-1 text-sm">
                            <span
                              className="font-black"
                              style={{ color: isZero ? LEGACY_COLORS.yellow : LEGACY_COLORS.cyan }}
                            >
                              {formatQty(rep.immediate)}
                            </span>
                            <span style={{ color: LEGACY_COLORS.muted2 }}>/</span>
                            <span className="font-bold" style={{ color: LEGACY_COLORS.blue }}>
                              {formatQty(rep.maximum)}
                            </span>
                          </span>
                          {isZero && rep.limiting_item && (
                            <span
                              className="col-span-3 text-[11px]"
                              style={{ color: LEGACY_COLORS.yellow }}
                            >
                              병목: {rep.limiting_item}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // 구버전 fallback — model_symbol 없는 환경
                <div
                  className="mb-4 rounded-[18px] border p-4 text-sm"
                  style={{
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }}
                >
                  모델별 대표 PF 정보 없음 — 아래 목록에서 PF 별 단독 수치 확인
                </div>
              )}

              {/* D: 쇼핑 리스트 — 병목 부품 집계 */}
              {shoppingList.length > 0 && (
                <div
                  className="mb-4 rounded-[18px] border p-4"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
                    borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 30%, transparent)`,
                  }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" style={{ color: LEGACY_COLORS.yellow }} />
                    <span
                      className="text-sm font-bold"
                      style={{ color: LEGACY_COLORS.yellow }}
                    >
                      공유 자재 — 한 자재가 여러 PF 의 병목
                    </span>
                  </div>
                  <div
                    className="mb-2 text-[11px] leading-relaxed"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    이 자재 한 종을 들여오면 아래 PF 들이 동시에 추가로 만들 수 있게 됨
                  </div>
                  <div className="space-y-1.5">
                    {shoppingList.map((s) => (
                      <div
                        key={s.part}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[10px] px-3 py-2"
                        style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.text} 5%, transparent)` }}
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
                            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 22%, transparent)`,
                            color: LEGACY_COLORS.yellow,
                          }}
                        >
                          공유 PF {s.count}종
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
                    조건에 맞는 PF 가 없습니다.
                  </div>
                )}

                {groupedItems.map((group) => (
                  <div key={group.key}>
                    {/* 모델 그룹 헤더 — 단독 합은 거짓이라 제거. "모델N · M종" 만 표시. */}
                    <div
                      className="grid grid-cols-[24px_1fr_120px_120px] items-center border-t px-4 py-2"
                      style={{
                        borderColor: LEGACY_COLORS.border,
                        background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
                      }}
                    >
                      <span />
                      <span
                        className="text-sm font-black"
                        style={{ color: LEGACY_COLORS.blue }}
                      >
                        {group.label}{" "}
                        <span
                          className="text-xs font-bold"
                          style={{ color: LEGACY_COLORS.muted2 }}
                        >
                          · {group.items.length}종
                        </span>
                      </span>
                      <span />
                      <span />
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
                              {item.mes_code && (
                                <div
                                  className="truncate text-xs"
                                  style={{ color: LEGACY_COLORS.muted2 }}
                                >
                                  {item.mes_code}
                                </div>
                              )}
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
                                background: `color-mix(in srgb, ${LEGACY_COLORS.text} 4%, transparent)`,
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
          key={`${c.mes_code ?? c.item_name}-${i}`}
          className="grid grid-cols-[1fr_70px_70px_70px_28px] items-center gap-2 rounded-[8px] px-2 py-1.5"
          style={{
            background: c.ok
              ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 6%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
          }}
        >
          <div className="min-w-0">
            <div
              className="truncate text-xs"
              style={{ color: LEGACY_COLORS.text }}
            >
              {c.item_name}
            </div>
            {c.mes_code && (
              <div
                className="truncate text-[10px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {c.mes_code}
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
