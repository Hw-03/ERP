"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle, CheckCircle2, X } from "lucide-react";
import type {
  ProductionCapacity,
  ProductionCapacityAfBlock,
  ProductionCapacityAfItem,
  ProductionCapacityPfVariant,
} from "@/lib/api/types/production";
import { groupAfByModel, getPinnedPfNumbers } from "@/lib/mes/capacity";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import {
  usePfPinsQuery,
  useSetPfPinMutation,
  useClearPfPinMutation,
} from "@/lib/queries/useProductionQuery";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";

type AfFilterMode = "producible" | "incomplete" | "all";

const SHARED_HINT =
  "각 수량은 AF별 독립 계산값 · 같은 하위 자재를 공유하면 모든 AF 수량을 동시에 보장하지는 않음";

/**
 * 생산 가능수량 상세 모달 — AF(조립 완제품) 기준.
 * ① AF별 3수량(출하 대기/빠른 조립/총생산) ② 각 병목 ③ 연결된 PF 변형(주문 기준 ship_ready)
 * ④ BOM 미완성 표시. af 블록이 없으면(구버전 응답) legacy 요약으로 fallback.
 */
export function CapacityDetailModal({
  capacityData,
  onClose,
}: {
  capacityData: ProductionCapacity | null;
  onClose: () => void;
}) {
  const af = capacityData?.af ?? null;

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
          height: "min(900px, 92vh)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ───────────────────────────────────────── */}
        <div className="border-b px-4 pb-5 pt-5 sm:px-7 sm:pt-7" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
            생산 가능수량
          </div>
          <div className="mt-0.5 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
            조립 완제품(AF) 기준
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
              <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.cyan }} />
              <span><span className="font-bold" style={{ color: LEGACY_COLORS.cyan }}>출하 대기</span> — 창고에 이미 완성된 PF(출하 완제품) 재고예요. 부품 확인 없이 지금 당장 고객에게 보낼 수 있어요.</span>
            </div>
            <div className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
              <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.blue }} />
              <span><span className="font-bold" style={{ color: LEGACY_COLORS.blue }}>빠른 생산</span> — AF 재고 + AF 직계 1단계 부품으로 만들 수 있는 AF를 PF로 환산한 수량이에요. 포장 구간 부품도 함께 확인해요.</span>
            </div>
            <div className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
              <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.purple }} />
              <span><span className="font-bold" style={{ color: LEGACY_COLORS.purple }}>총생산</span> — PF를 기준으로 BOM 전체를 끝까지 펼쳐서 이론적으로 만들 수 있는 최대 수량이에요. 부품 공유로 인한 중복은 제거해요.</span>
            </div>
          </div>
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 14%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            <AlertTriangle className="h-3 w-3" />
            {SHARED_HINT}
          </div>
        </div>

        {/* ── 본문 (스크롤) ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-7">
          {af ? (
            <AfCapacityView af={af} />
          ) : (
            <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              {capacityData == null
                ? "데이터를 불러오는 중…"
                : "AF 기준 데이터가 없습니다. 백엔드 갱신 후 다시 확인해 주세요."}
            </div>
          )}
        </div>

        {/* ── 푸터 ───────────────────────────────────────── */}
        <div className="border-t px-7 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
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

function isIncomplete(it: ProductionCapacityAfItem): boolean {
  return it.bom_status === "incomplete" || !it.has_pf_path;
}

function AfCapacityView({ af }: { af: ProductionCapacityAfBlock }) {
  const { data: pfPins = {} } = usePfPinsQuery();
  const setPfPin = useSetPfPinMutation();
  const clearPfPin = useClearPfPinMutation();
  const isPinLoading = setPfPin.isPending || clearPfPin.isPending;

  const items = af.items;

  const producibleCount = useMemo(
    () =>
      items.filter(
        (it) => it.ship_ready > 0 || it.fast_production > 0 || it.total_production > 0,
      ).length,
    [items],
  );
  const incompleteCount = useMemo(() => items.filter(isIncomplete).length, [items]);

  const [filterMode, setFilterMode] = useState<AfFilterMode>("producible");
  const filtered = useMemo(() => {
    if (filterMode === "producible")
      return items.filter(
        (it) => it.ship_ready > 0 || it.fast_production > 0 || it.total_production > 0,
      );
    if (filterMode === "incomplete") return items.filter(isIncomplete);
    return items;
  }, [items, filterMode]);

  // 모델(model_symbol) 단위 그룹화 + 모델 합계.
  const grouped = useMemo(() => groupAfByModel(filtered), [filtered]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [unpinTarget, setUnpinTarget] = useState<string | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpandedGroups((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const variantsByAf = useMemo(() => {
    const map = new Map<string, ProductionCapacityPfVariant[]>();
    for (const v of af.pf_variants) {
      if (!v.af_item_id) continue;
      const arr = map.get(v.af_item_id) ?? [];
      arr.push(v);
      map.set(v.af_item_id, arr);
    }
    return map;
  }, [af.pf_variants]);

  if (items.length === 0) {
    const msg =
      af.status === "no_target"
        ? "조립 완제품(AF) 기준 품목이 없습니다."
        : af.status === "bom_not_registered"
          ? "AF 직계 BOM 이 등록되지 않아 계산할 수 없습니다."
          : "표시할 항목이 없습니다.";
    return (
      <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
        {msg}
      </div>
    );
  }

  return (
    <>
      {/* 필터 토글 */}
      <div className="mb-6 flex items-center gap-2">
        {(
          [
            { key: "producible", label: "생산 가능", count: producibleCount, color: LEGACY_COLORS.cyan },
            { key: "incomplete", label: "미완성", count: incompleteCount, color: LEGACY_COLORS.yellow },
            { key: "all", label: "전체", count: items.length, color: LEGACY_COLORS.muted2 },
          ] as { key: AfFilterMode; label: string; count: number; color: string }[]
        ).map((f) => {
          const active = filterMode === f.key;
          return (
            <button
              key={f.key}
              type="button"
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

      {/* AF 목록 — 모바일: 카드 레이아웃 / 데스크톱: 테이블 */}

      {/* 모바일 카드 레이아웃 (< 640px) */}
      <div className="sm:hidden rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
        {grouped.length === 0 && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            조건에 맞는 AF 가 없습니다.
          </div>
        )}
        {grouped.map((group) => {
          const pinnedPfId = pfPins[group.key];
          const pinnedVariant = pinnedPfId
            ? af.pf_variants.find((v) => v.pf_item_id === pinnedPfId)
            : null;
          const pinnedNumbers = getPinnedPfNumbers(group.key, pfPins, af);
          const groupCollapsed = !expandedGroups.has(group.key);
          return (
          <div key={group.key}>
            {/* 모델 그룹 헤더 */}
            <div
              className="border-t px-4 py-2.5 first:border-t-0 cursor-pointer select-none"
              style={{
                borderColor: LEGACY_COLORS.border,
                background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
              }}
              onClick={() => toggleGroup(group.key)}
            >
              <div className="flex flex-wrap items-center gap-2">
                {groupCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                )}
                <span className="text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>
                  {group.label}{" "}
                  <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                    · {group.items.length}종
                  </span>
                </span>
                {pinnedVariant ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 14%, transparent)`,
                      color: LEGACY_COLORS.cyan,
                    }}
                  >
                    {pinnedVariant.pf_name || pinnedVariant.pf_code}
                    <button
                      type="button"
                      disabled={isPinLoading}
                      onClick={(e) => { e.stopPropagation(); setUnpinTarget(group.key); }}
                      className="ml-0.5"
                      aria-label="기준 PF 해제"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 12%, transparent)`,
                      color: LEGACY_COLORS.muted2,
                    }}
                  >
                    출고처 미지정
                  </span>
                )}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {pinnedNumbers ? (
                  <>
                    <QtyLabelCell label="출하 대기" value={pinnedNumbers.ship_ready} color={LEGACY_COLORS.cyan} />
                    <QtyLabelCell label="빠른 생산" value={pinnedNumbers.fast_production} color={LEGACY_COLORS.blue} />
                    <QtyLabelCell label="총생산" value={pinnedNumbers.total_production} color={LEGACY_COLORS.purple} />
                  </>
                ) : (
                  <>
                    <DashLabelCell label="출하 대기" />
                    <DashLabelCell label="빠른 생산" />
                    <DashLabelCell label="총생산" />
                  </>
                )}
              </div>
            </div>
            {/* AF 아이템 카드 */}
            {!groupCollapsed && group.items.map((it) => {
              const expanded = expandedIds.has(it.af_item_id);
              const variants = variantsByAf.get(it.af_item_id) ?? [];
              return (
                <div key={it.af_item_id} className="border-t" style={{ borderColor: LEGACY_COLORS.border }}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(it.af_item_id)}
                    className="w-full px-4 py-3 text-left transition-colors hover:brightness-110"
                  >
                    <div className="flex items-start gap-2">
                      {expanded ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                            {it.af_name}
                          </span>
                          {it.bom_status === "incomplete" && (
                            <Badge color={LEGACY_COLORS.yellow}>BOM 미완성</Badge>
                          )}
                          {it.bom_status !== "incomplete" && !it.has_pf_path && (
                            <Badge color={LEGACY_COLORS.muted2}>출하경로 없음</Badge>
                          )}
                        </div>
                        {it.af_code && (
                          <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {it.af_code}
                          </div>
                        )}
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          <QtyLabelCell label="출하 대기" value={it.ship_ready} color={LEGACY_COLORS.cyan} />
                          <QtyLabelCell label="빠른 생산" value={it.fast_production} color={LEGACY_COLORS.blue} />
                          <QtyLabelCell label="총생산" value={it.total_production} color={LEGACY_COLORS.purple} />
                        </div>
                      </div>
                    </div>
                  </button>
                  {expanded && (
                    <div
                      className="border-t px-5 py-3"
                      style={{
                        borderColor: LEGACY_COLORS.border,
                        background: `color-mix(in srgb, ${LEGACY_COLORS.text} 4%, transparent)`,
                      }}
                    >
                      <PfVariants
                        variants={variants}
                        hasPfPath={it.has_pf_path}
                        pinnedPfId={pinnedPfId}
                        modelSymbol={group.key}
                        onPin={(pfItemId) => setPfPin.mutate({ modelSymbol: group.key, pfItemId })}
                        onUnpin={() => clearPfPin.mutate(group.key)}
                        isPinLoading={isPinLoading}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>

      <ConfirmModal
        open={unpinTarget !== null}
        title="기준 PF 해제"
        tone="caution"
        confirmLabel="해제"
        onClose={() => setUnpinTarget(null)}
        onConfirm={() => {
          if (unpinTarget) clearPfPin.mutate(unpinTarget);
          setUnpinTarget(null);
        }}
        busy={isPinLoading}
      >
        <p className="mb-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          기준 PF 지정을 해제하시겠습니까?
        </p>
      </ConfirmModal>

      {/* 데스크톱 테이블 레이아웃 (≥ 640px) */}
      <div className="hidden sm:block rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
        <div
          className="grid grid-cols-[20px_minmax(0,1fr)_84px_84px_84px] border-b px-4 py-4 text-xs font-bold uppercase tracking-[0.12em]"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          <span />
          <span>조립 완제품 · 병목</span>
          <span className="text-right">출하 대기</span>
          <span className="text-right">빠른 생산</span>
          <span className="text-right">총생산</span>
        </div>

        {grouped.length === 0 && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            조건에 맞는 AF 가 없습니다.
          </div>
        )}

        {grouped.map((group) => {
          const pinnedPfId = pfPins[group.key];
          const pinnedVariant = pinnedPfId
            ? af.pf_variants.find((v) => v.pf_item_id === pinnedPfId)
            : null;
          const pinnedNumbers = getPinnedPfNumbers(group.key, pfPins, af);
          const groupCollapsed = !expandedGroups.has(group.key);
          return (
          <div key={group.key}>
            <div
              className="grid grid-cols-[20px_minmax(0,1fr)_84px_84px_84px] items-center border-t px-4 py-5 cursor-pointer select-none"
              style={{
                borderColor: LEGACY_COLORS.border,
                background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
              }}
              onClick={() => toggleGroup(group.key)}
            >
              {groupCollapsed ? (
                <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
              ) : (
                <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>
                  {group.label}{" "}
                  <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                    · {group.items.length}종
                  </span>
                </span>
                {pinnedVariant ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 14%, transparent)`,
                      color: LEGACY_COLORS.cyan,
                    }}
                  >
                    {pinnedVariant.pf_name || pinnedVariant.pf_code}
                    <button
                      type="button"
                      disabled={isPinLoading}
                      onClick={(e) => { e.stopPropagation(); setUnpinTarget(group.key); }}
                      className="ml-0.5"
                      aria-label="기준 PF 해제"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 12%, transparent)`,
                      color: LEGACY_COLORS.muted2,
                    }}
                  >
                    출고처 미지정
                  </span>
                )}
              </div>
              {pinnedNumbers ? (
                <>
                  <QtyCell value={pinnedNumbers.ship_ready} color={LEGACY_COLORS.cyan} />
                  <QtyCell value={pinnedNumbers.fast_production} color={LEGACY_COLORS.blue} />
                  <QtyCell value={pinnedNumbers.total_production} color={LEGACY_COLORS.purple} />
                </>
              ) : (
                <>
                  <div className="text-right text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>—</div>
                  <div className="text-right text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>—</div>
                  <div className="text-right text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>—</div>
                </>
              )}
            </div>

            {!groupCollapsed && group.items.map((it) => {
              const expanded = expandedIds.has(it.af_item_id);
              const variants = variantsByAf.get(it.af_item_id) ?? [];
              return (
                <div key={it.af_item_id}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(it.af_item_id)}
                    className="grid w-full cursor-pointer grid-cols-[20px_minmax(0,1fr)_84px_84px_84px] items-center border-t px-4 py-2.5 text-left transition-colors hover:brightness-110"
                    style={{ borderColor: LEGACY_COLORS.border }}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
                    ) : (
                      <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
                    )}
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>
                          {it.af_name}
                        </span>
                        {it.bom_status === "incomplete" && (
                          <Badge color={LEGACY_COLORS.yellow}>BOM 미완성</Badge>
                        )}
                        {it.bom_status !== "incomplete" && !it.has_pf_path && (
                          <Badge color={LEGACY_COLORS.muted2}>출하경로 없음</Badge>
                        )}
                      </div>
                      {it.af_code && (
                        <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {it.af_code}
                        </div>
                      )}
                    </div>
                    <QtyCell value={it.ship_ready} color={LEGACY_COLORS.cyan} />
                    <QtyCell value={it.fast_production} color={LEGACY_COLORS.blue} />
                    <QtyCell value={it.total_production} color={LEGACY_COLORS.purple} />
                  </button>

                  {expanded && (
                    <div
                      className="border-t px-5 py-3"
                      style={{
                        borderColor: LEGACY_COLORS.border,
                        background: `color-mix(in srgb, ${LEGACY_COLORS.text} 4%, transparent)`,
                      }}
                    >
                      <PfVariants
                        variants={variants}
                        hasPfPath={it.has_pf_path}
                        pinnedPfId={pinnedPfId}
                        modelSymbol={group.key}
                        onPin={(pfItemId) => setPfPin.mutate({ modelSymbol: group.key, pfItemId })}
                        onUnpin={() => clearPfPin.mutate(group.key)}
                        isPinLoading={isPinLoading}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>
    </>
  );
}

function QtyLabelCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
      <div className="text-sm font-bold" style={{ color: value > 0 ? color : LEGACY_COLORS.muted2 }}>
        {formatQty(value)}
      </div>
    </div>
  );
}

function DashLabelCell({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
      <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>—</div>
    </div>
  );
}

function QtyCell({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="text-right text-sm font-bold"
      style={{ color: value > 0 ? color : LEGACY_COLORS.muted2 }}
    >
      {formatQty(value)}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-xs font-bold"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
      }}
    >
      {children}
    </span>
  );
}

function PfVariants({
  variants,
  hasPfPath,
  pinnedPfId,
  modelSymbol: _modelSymbol,
  onPin,
  onUnpin,
  isPinLoading,
}: {
  variants: ProductionCapacityPfVariant[];
  hasPfPath: boolean;
  pinnedPfId?: string;
  modelSymbol?: string;
  onPin?: (pfItemId: string) => void;
  onUnpin?: () => void;
  isPinLoading?: boolean;
}) {
  if (variants.length === 0) {
    return (
      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        {hasPfPath
          ? "연결된 출하(PF) 변형 정보가 없습니다."
          : "출하 경로(PF)가 연결되지 않았습니다 — 출하 준비 가능 수량 0."}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="mb-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        출하 변형(PF)별 출하 준비 가능 — 특정 주문 기준
      </div>
      <div
        className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px_64px_28px] gap-2 px-2 pb-1 text-xs font-bold uppercase tracking-[0.12em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        <span>출하 완제품 · 병목</span>
        <span className="text-right">출하 대기</span>
        <span className="text-right">빠른 생산</span>
        <span className="text-right">총생산</span>
        <span />
        <span />
      </div>
      {variants.map((v) => {
        const ok = v.ship_ready > 0 || v.fast_production > 0;
        const isPinned = pinnedPfId === v.pf_item_id;
        return (
          <div
            key={v.pf_item_id}
            className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px_64px_28px] items-center gap-2 rounded-[8px] px-2 py-1.5"
            style={{
              background: isPinned
                ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 10%, transparent)`
                : ok
                  ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 6%, transparent)`
                  : `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
              outline: isPinned ? `1.5px solid color-mix(in srgb, ${LEGACY_COLORS.cyan} 40%, transparent)` : undefined,
            }}
          >
            <div className="min-w-0">
              <div className="truncate text-xs" style={{ color: LEGACY_COLORS.text }}>
                {v.pf_name}
              </div>
              {v.pf_code && (
                <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {v.pf_code}
                </div>
              )}
              {v.fast_production_limiting_item && (
                <div className="truncate text-xs" style={{ color: LEGACY_COLORS.yellow }}>
                  병목(빠른): {v.fast_production_limiting_item}
                </div>
              )}
              {v.total_production_limiting_item && (
                <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  병목(총): {v.total_production_limiting_item}
                </div>
              )}
            </div>
            <div
              className="text-right text-sm font-bold"
              style={{ color: v.ship_ready > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
            >
              {formatQty(v.ship_ready)}
            </div>
            <div
              className="text-right text-sm font-bold"
              style={{ color: v.fast_production > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
            >
              {formatQty(v.fast_production)}
            </div>
            <div
              className="text-right text-sm font-bold"
              style={{ color: v.total_production > 0 ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2 }}
            >
              {formatQty(v.total_production)}
            </div>
            <div className="flex justify-end">
              {isPinned ? (
                <button
                  type="button"
                  disabled={isPinLoading}
                  onClick={onUnpin}
                  className="rounded-full px-1.5 py-0.5 text-xs font-bold"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 18%, transparent)`,
                    color: LEGACY_COLORS.cyan,
                  }}
                >
                  기준
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isPinLoading}
                  onClick={() => onPin?.(v.pf_item_id)}
                  className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  지정
                </button>
              )}
            </div>
            <div className="flex justify-end">
              {ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.green }} />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.yellow }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
