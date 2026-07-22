"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, X } from "lucide-react";
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


const DESKTOP_CAPACITY_GRID =
  "grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]";

const DESKTOP_PF_GRID =
  "sm:grid-cols-[20px_120px_72px_minmax(0,1fr)_84px_84px_84px]";

const SHARED_HINT_LINES = [
  "공용 자재가 겹치는 모델은 표시 수량을 모두 동시에 생산할 수 없습니다.",
  "한 모델에 자재를 사용하면 다른 모델의 생산 가능 수량은 줄어들 수 있습니다.",
];

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
        className="flex w-full max-w-[min(1600px,97vw)] flex-col rounded-[28px] border"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          height: "min(900px, 92vh)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ───────────────────────────────────────── */}
        <div className="border-b px-4 pb-3 pt-4 sm:px-7 sm:pb-5 sm:pt-7" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-start justify-between">
            <div className="text-lg font-black sm:text-2xl" style={{ color: LEGACY_COLORS.text }}>
              생산 가능수량
            </div>
            <button
              onClick={onClose}
              className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
                color: LEGACY_COLORS.red,
              }}
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 space-y-1 sm:mt-3 sm:space-y-1.5">
            <div className="flex items-start gap-2 text-xs leading-snug sm:text-base sm:leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
              <span className="mt-[4px] h-2 w-2 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.cyan }} />
              <span><span className="font-bold" style={{ color: LEGACY_COLORS.cyan }}>출하 대기</span> — 박스 포장까지 완료되어 픽업을 기다리고 있는 재고입니다.</span>
            </div>
            <div className="flex items-start gap-2 text-xs leading-snug sm:text-base sm:leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
              <span className="mt-[4px] h-2 w-2 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.blue }} />
              <span><span className="font-bold" style={{ color: LEGACY_COLORS.blue }}>빠른 생산</span> — 테스트가 완료된 완제품 재고와 포장 자재를 확인해 빠르게 박스 포장까지 할 수 있는 수량입니다.</span>
            </div>
            <div className="flex items-start gap-2 text-xs leading-snug sm:text-base sm:leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
              <span className="mt-[4px] h-2 w-2 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.purple }} />
              <span><span className="font-bold" style={{ color: LEGACY_COLORS.purple }}>총생산</span> — 튜브부터 박스까지 사내 재고를 사용해 이론적으로 생산할 수 있는 총합입니다.</span>
            </div>
          </div>
          <div
            className="mt-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:mt-3 sm:inline-flex sm:rounded-full sm:py-1 sm:text-base"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 14%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            <span className="flex flex-col">
              {SHARED_HINT_LINES.map((line) => <span key={line}>{line}</span>)}
            </span>
          </div>
        </div>

        {/* ── 본문 (스크롤) ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-8">
          {af ? (
            <AfCapacityView af={af} />
          ) : (
            <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              {capacityData == null
                ? "데이터를 불러오는 중…"
                : "AF 기준 데이터가 없습니다. 백엔드 갱신 후 다시 확인해 주세요."}
            </div>
          )}
        </div>

        {/* ── 푸터 ───────────────────────────────────────── */}
        <div className="border-t px-7 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <button
            className="w-full rounded-[18px] border py-3 text-lg font-semibold"
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

  const filtered = items;

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
      <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
        {msg}
      </div>
    );
  }

  return (
    <>

      {/* AF 목록 — 모바일: 카드 레이아웃 / 데스크톱: 테이블 */}

      {/* 모바일 카드 레이아웃 (< 640px) */}
      <div className="sm:hidden rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
        {grouped.length === 0 && (
          <div className="px-4 py-6 text-center text-base" style={{ color: LEGACY_COLORS.muted2 }}>
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
          <div key={group.key} className="border-t first:border-t-0" style={{ borderColor: LEGACY_COLORS.border }}>
            {/* 모델 그룹 제목만 접기·펼치기 동작을 담당한다. */}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
              onClick={() => toggleGroup(group.key)}
              aria-expanded={!groupCollapsed}
            >
                {groupCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                )}
                <span className="text-base font-black" style={{ color: LEGACY_COLORS.blue }}>
                  {group.label}{" "}
                  <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                    · {group.items.length}종
                  </span>
                </span>
            </button>

            {pinnedVariant ? (
              <div className="border-t px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="text-[10px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  기준 출하 완제품
                </div>
                <div className="mt-0.5 flex items-start gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm font-bold" style={{ color: LEGACY_COLORS.cyan }}>
                    {pinnedVariant.pf_name || pinnedVariant.pf_code}
                  </span>
                  <button
                    type="button"
                    disabled={isPinLoading}
                    onClick={() => setUnpinTarget(group.key)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
                      color: LEGACY_COLORS.red,
                    }}
                    aria-label="기준 PF 해제"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-t px-4 py-2 text-sm font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                기준 출하 완제품 미지정
              </div>
            )}

            <div className="grid grid-cols-3 divide-x border-t" style={{ borderColor: LEGACY_COLORS.border }}>
              {pinnedNumbers ? (
                <>
                  <div className="px-1.5 py-2">
                    <QtyLabelCell label="출하 대기" value={pinnedNumbers.ship_ready} color={LEGACY_COLORS.cyan} />
                  </div>
                  <div className="px-1.5 py-2">
                    <QtyLabelCell label="빠른 생산" value={pinnedNumbers.fast_production} color={LEGACY_COLORS.blue} />
                  </div>
                  <div className="px-1.5 py-2">
                    <QtyLabelCell label="총생산" value={pinnedNumbers.total_production} color={LEGACY_COLORS.purple} />
                  </div>
                </>
              ) : (
                <>
                  <div className="px-1.5 py-2">
                    <DashLabelCell label="출하 대기" />
                  </div>
                  <div className="px-1.5 py-2">
                    <DashLabelCell label="빠른 생산" />
                  </div>
                  <div className="px-1.5 py-2">
                    <DashLabelCell label="총생산" />
                  </div>
                </>
              )}
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
                          <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
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
                          <div className="truncate text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
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
                      className="border-t px-4 py-3"
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
        <p className="mb-2 text-base" style={{ color: LEGACY_COLORS.muted2 }}>
          기준 PF 지정을 해제하시겠습니까?
        </p>
      </ConfirmModal>

      {/* 데스크톱 테이블 레이아웃 (≥ 640px) */}
      <div className="hidden sm:block rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
        <div
          className={`grid ${DESKTOP_CAPACITY_GRID} border-b px-4 py-4 text-sm font-bold uppercase tracking-[0.12em]`}
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          <span />
          <span>조립 완제품</span>
          <span>모델 수</span>
          <span>기준 모델</span>
          <span className="text-right">출하 대기</span>
          <span className="text-right">빠른 생산</span>
          <span className="text-right">총생산</span>
        </div>

        {grouped.length === 0 && (
          <div className="px-4 py-6 text-center text-base" style={{ color: LEGACY_COLORS.muted2 }}>
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
              className={`grid ${DESKTOP_CAPACITY_GRID} items-center border-t px-4 py-5 cursor-pointer select-none`}
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
                <span className="text-base font-black" style={{ color: LEGACY_COLORS.blue }}>
                  {group.label}
                </span>
              </div>
              <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                {group.items.length}종
              </span>
              <div className="min-w-0">
                {pinnedVariant ? (
                  <span
                    className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-sm font-bold"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 14%, transparent)`,
                      color: LEGACY_COLORS.cyan,
                    }}
                  >
                    <span className="truncate">{pinnedVariant.pf_name || pinnedVariant.pf_code}</span>
                    <button
                      type="button"
                      disabled={isPinLoading}
                      onClick={(e) => { e.stopPropagation(); setUnpinTarget(group.key); }}
                      className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110"
                      style={{
                        background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
                        color: LEGACY_COLORS.red,
                      }}
                      aria-label="기준 PF 해제"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <span
                    className="rounded-full px-2 py-0.5 text-sm font-semibold"
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
                  <div className="text-right text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>—</div>
                  <div className="text-right text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>—</div>
                  <div className="text-right text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>—</div>
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
                    className={`grid w-full cursor-pointer ${DESKTOP_CAPACITY_GRID} items-center border-t px-4 py-2.5 text-left transition-colors hover:brightness-110`}
                    style={{ borderColor: LEGACY_COLORS.border }}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
                    ) : (
                      <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
                    )}
                    <div className="col-span-3 min-w-0 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base leading-5" style={{ color: LEGACY_COLORS.text }}>
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
                        <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
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
                      className="border-t px-4 py-3"
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
      <div className="text-base font-bold" style={{ color: value > 0 ? color : LEGACY_COLORS.muted2 }}>
        {formatQty(value)}
      </div>
    </div>
  );
}

function DashLabelCell({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
      <div className="text-base font-bold" style={{ color: LEGACY_COLORS.muted2 }}>—</div>
    </div>
  );
}

function QtyCell({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="text-right text-base font-bold"
      style={{ color: value > 0 ? color : LEGACY_COLORS.muted2 }}
    >
      {formatQty(value)}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-sm font-bold"
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
      <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
        {hasPfPath
          ? "연결된 출하(PF) 변형 정보가 없습니다."
          : "출하 경로(PF)가 연결되지 않았습니다 — 출하 준비 가능 수량 0."}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="mb-1 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        출고처별 출하 준비 가능
      </div>
      {variants.map((v) => {
        const ok = v.ship_ready > 0 || v.fast_production > 0;
        const isPinned = pinnedPfId === v.pf_item_id;
        return (
          <div
            key={v.pf_item_id}
            className={`grid grid-cols-[minmax(0,1fr)_72px_72px_72px_64px_28px] ${DESKTOP_PF_GRID} items-center gap-2 rounded-[8px] px-2 py-1.5 sm:gap-0 sm:px-0`}
            style={{
              background: isPinned
                ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 10%, transparent)`
                : ok
                  ? `color-mix(in srgb, ${LEGACY_COLORS.cyan} 6%, transparent)`
                  : `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
              outline: isPinned ? `1.5px solid color-mix(in srgb, ${LEGACY_COLORS.cyan} 40%, transparent)` : undefined,
            }}
          >
            <div className="min-w-0 sm:col-span-4">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm leading-5" style={{ color: LEGACY_COLORS.text }}>
                    {v.pf_name}
                    {v.pf_code && (
                      <span className="ml-1.5" style={{ color: LEGACY_COLORS.muted2 }}>
                        ({v.pf_code})
                      </span>
                    )}
                  </div>
                  {v.fast_production_limiting_item && (
                    <div className="break-words text-sm leading-5" style={{ color: LEGACY_COLORS.yellow }}>
                      빠른 생산 병목: {v.fast_production_limiting_item}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isPinned ? (
                    <button
                      type="button"
                      disabled={isPinLoading}
                      onClick={onUnpin}
                      className="rounded-full px-1.5 py-0.5 text-sm font-bold"
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
                      className="rounded-full px-1.5 py-0.5 text-sm font-semibold"
                      style={{ color: LEGACY_COLORS.muted2 }}
                    >
                      지정
                    </button>
                  )}
                  <span className="flex" aria-label={ok ? "생산 가능" : "생산 제한"}>
                    {ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.green }} />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.yellow }} />
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div
              className="text-right text-base font-bold"
              style={{ color: v.ship_ready > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
            >
              {formatQty(v.ship_ready)}
            </div>
            <div
              className="text-right text-base font-bold"
              style={{ color: v.fast_production > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
            >
              {formatQty(v.fast_production)}
            </div>
            <div
              className="text-right text-base font-bold"
              style={{ color: v.total_production > 0 ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2 }}
            >
              {formatQty(v.total_production)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
