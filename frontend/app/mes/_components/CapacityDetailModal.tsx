"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ChevronRight, AlertCircle, X } from "lucide-react";
import type {
  ProductionCapacity,
  ProductionCapacityAfBlock,
  ProductionCapacityPfVariant,
} from "@/lib/api/types/production";
import { getAutoRepresentative, groupAfByModel } from "@/lib/mes/capacity";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { DesktopCapacityPfWorkspace } from "./_capacity_sections/DesktopCapacityPfWorkspace";
import { BomDetailModal } from "./_inventory_sections/BomDetailModal";
import { ReadLoading } from "./common/ReadState";
import { LoadFailureCard } from "./common/LoadFailureCard";
import { SkeletonBlock, dataRevealClassName } from "./common/LoadingSkeleton";

const DESKTOP_PF_GRID =
  "lg:grid-cols-[20px_120px_72px_minmax(0,1fr)_120px_84px_84px_84px]";

const DESKTOP_CAPACITY_GRID =
  "grid-cols-[20px_120px_72px_minmax(0,1fr)_120px_84px_84px_84px]";

const MOBILE_CAPACITY_GRID = "grid grid-cols-3 items-center gap-1 px-2";

const SHARED_HINT =
  "공용 자재가 겹치는 모델은 표시 수량을 모두 동시에 생산할 수 없으며, 한 모델에 사용하면 다른 모델의 생산 가능 수량이 줄어들 수 있습니다.";

const DESKTOP_CAPACITY_MEDIA_QUERY = "(min-width: 1024px)";
const CAPACITY_DETAIL_HISTORY_KEY = "capacityDetailPfItemId";

function getDesktopCapacitySnapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_CAPACITY_MEDIA_QUERY).matches
    : false;
}

function subscribeDesktopCapacity(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mediaQuery = window.matchMedia(DESKTOP_CAPACITY_MEDIA_QUERY);
  const handleChange = () => onChange();
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }
  mediaQuery.addListener(handleChange);
  return () => mediaQuery.removeListener(handleChange);
}

function useDesktopCapacityLayout(): boolean {
  return useSyncExternalStore(
    subscribeDesktopCapacity,
    getDesktopCapacitySnapshot,
    () => false,
  );
}

/** 모바일 AF 목록·기존 BOM 창과 데스크톱 PF·전체 BOM 작업공간을 연결한다. */
export function CapacityDetailModal({
  capacityData,
  onClose,
  loading = capacityData === null,
  error = null,
  onRetry,
}: {
  capacityData: ProductionCapacity | null;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const af = capacityData?.af ?? null;
  const isDesktopCapacityLayout = useDesktopCapacityLayout();
  const [selectedPfItemId, setSelectedPfItemId] = useState<string | null>(null);
  const [mobileBomItemId, setMobileBomItemId] = useState<string | null>(null);
  const selectedPf = useMemo(
    () => af?.pf_variants.find((variant) => variant.pf_item_id === selectedPfItemId) ?? null,
    [af, selectedPfItemId],
  );

  useEffect(() => {
    if (!isDesktopCapacityLayout || (selectedPfItemId && !selectedPf)) {
      setSelectedPfItemId(null);
    }
  }, [isDesktopCapacityLayout, selectedPf, selectedPfItemId]);

  useEffect(() => {
    if (mobileBomItemId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [mobileBomItemId, onClose]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const historyState = event.state;
      const pfItemId =
        historyState && typeof historyState === "object"
          ? historyState[CAPACITY_DETAIL_HISTORY_KEY]
          : null;
      setSelectedPfItemId(typeof pfItemId === "string" ? pfItemId : null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openBom = (variant: ProductionCapacityPfVariant) => {
    const historyState = window.history.state;
    window.history.pushState(
      {
        ...(historyState && typeof historyState === "object" ? historyState : {}),
        [CAPACITY_DETAIL_HISTORY_KEY]: variant.pf_item_id,
      },
      "",
    );
    setSelectedPfItemId(variant.pf_item_id);
  };

  const returnToCapacitySummary = () => {
    const historyState = window.history.state;
    if (
      historyState &&
      typeof historyState === "object" &&
      historyState[CAPACITY_DETAIL_HISTORY_KEY] === selectedPfItemId
    ) {
      window.history.back();
      return;
    }
    setSelectedPfItemId(null);
  };

  const isPfDetail = isDesktopCapacityLayout && selectedPf !== null;

  return (
    <>
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: LEGACY_COLORS.bg }}
      onClick={onClose}
    >
      <div
        className="flex h-[92vh] w-[calc(100vw-32px)] min-h-0 flex-col rounded-[24px] border lg:h-[84vh] lg:w-[calc(100vw-128px)]"
        style={{
          background: "var(--c-popup-bg)",
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isPfDetail && (
          <>
            {/* ── 헤더 ───────────────────────────────────────── */}
            {isDesktopCapacityLayout ? (
            <div className="border-b px-4 py-3 lg:px-7 lg:py-4" style={{ borderColor: LEGACY_COLORS.border }}>
              <div className="flex items-center gap-4">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-1 lg:grid-cols-3">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs leading-5 lg:text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.cyan }} />
                    <span><span className="font-bold" style={{ color: LEGACY_COLORS.cyan }}>출하 대기</span> — 박스 포장까지 완료되어 픽업을 기다리는 재고</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-xs leading-5 lg:text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.blue }} />
                    <span><span className="font-bold" style={{ color: LEGACY_COLORS.blue }}>빠른 생산</span> — 테스트 완료 완제품과 포장 자재로 빠르게 포장 가능한 수량</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-xs leading-5 lg:text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.purple }} />
                    <span><span className="font-bold" style={{ color: LEGACY_COLORS.purple }}>총생산</span> — 튜브부터 박스까지 사내 재고로 이론상 생산 가능한 총합</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="standard-hover ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
                    color: LEGACY_COLORS.red,
                  }}
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
                <div className="shrink-0 text-lg font-black lg:text-2xl" style={{ color: LEGACY_COLORS.text }}>
                  생산 가능수량
                </div>
                <div
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-3 py-1.5 text-xs font-semibold lg:text-sm"
                  style={{
                    background: LEGACY_COLORS.warningBg,
                    borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 30%, transparent)`,
                    color: LEGACY_COLORS.yellow,
                  }}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{SHARED_HINT}</span>
                </div>
              </div>
            </div>
            ) : (
              <div className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="flex min-h-11 items-center gap-3">
                  <div className="min-w-0 flex-1 text-lg font-semibold" style={{ color: LEGACY_COLORS.text }}>
                    생산 가능수량
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="standard-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
                    aria-label="닫기"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {isPfDetail && selectedPf ? (
          <DesktopCapacityPfWorkspace
            variant={selectedPf}
            onBack={returnToCapacitySummary}
            onClose={onClose}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 lg:px-7 lg:py-8">
            <div className="flex min-h-0 flex-1 flex-col">
              {!isDesktopCapacityLayout && error && <div className="mb-3"><LoadFailureCard message={error} onRetry={onRetry} retryLabel="다시 시도" comfortable
                prefix={capacityData ? "최신 정보를 불러오지 못했습니다. 기존 내용을 표시합니다" : "데이터를 불러오지 못했습니다"} /></div>}
              {!isDesktopCapacityLayout && loading && !capacityData ? (
                <ReadLoading label="생산 가능수량 불러오는 중" skeleton={<MobileCapacitySkeleton />} />
              ) : af ? (
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] lg:block lg:overflow-y-scroll">
                  <AfCapacitySummary
                    af={af}
                    onOpenBom={isDesktopCapacityLayout
                      ? openBom
                      : (variant) => setMobileBomItemId(variant.pf_item_id)}
                  />
                </div>
              ) : !isDesktopCapacityLayout && error && !capacityData ? null : (
                <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
                  {capacityData == null
                    ? !isDesktopCapacityLayout && !loading ? "표시할 생산 가능수량이 없습니다." : "데이터를 불러오는 중…"
                    : "AF 기준 데이터가 없습니다. 백엔드 갱신 후 다시 확인해 주세요."}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
      <BomDetailModal
        itemId={mobileBomItemId ?? ""}
        open={mobileBomItemId !== null}
        mobilePresentation
        onClose={() => setMobileBomItemId(null)}
      />
    </>
  );
}

/** Reserve the mobile summary's column header and collapsed model rows. */
function MobileCapacitySkeleton() {
  return <div className="rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
    <div data-testid="capacity-mobile-columns" className={`${MOBILE_CAPACITY_GRID} sticky top-0 min-h-11 rounded-t-[16px] border-b text-xs font-medium`}
      style={{ background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
      <span className="text-center">출하대기</span><span className="text-center">빠른생산</span><span className="text-center">총생산</span>
    </div>
    {Array.from({ length: 3 }, (_, index) => <div key={index} className="border-t first:border-t-0" style={{ borderColor: LEGACY_COLORS.border }}>
      <div className="flex min-h-11 items-center gap-2 px-2 py-2.5" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)` }}>
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} /><SkeletonBlock className="h-4 w-24" />
      </div>
      <div className={`${MOBILE_CAPACITY_GRID} gap-y-2 border-t py-2`} style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="col-span-3 flex flex-col gap-1"><SkeletonBlock className="h-3 w-36" /><SkeletonBlock className="h-4 w-2/3" /></div>
        {[0, 1, 2].map(column => <SkeletonBlock key={column} className="mx-auto h-6 w-12" />)}
      </div>
    </div>)}
  </div>;
}

function AfCapacitySummary({
  af,
  onOpenBom,
}: {
  af: ProductionCapacityAfBlock;
  onOpenBom?: (variant: ProductionCapacityPfVariant) => void;
}) {
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

      {/* 모바일 카드 레이아웃 (< 1024px) */}
      <div className={`lg:hidden rounded-[16px] border ${dataRevealClassName}`} style={{ borderColor: LEGACY_COLORS.border }}>
        <div
          data-testid="capacity-mobile-columns"
          className={`${MOBILE_CAPACITY_GRID} sticky top-0 z-10 min-h-11 rounded-t-[16px] border-b text-xs font-medium`}
          style={{ background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          <span className="text-center">출하대기</span>
          <span className="text-center">빠른생산</span>
          <span className="text-center">총생산</span>
        </div>
        {grouped.length === 0 && (
          <div className="px-4 py-6 text-center text-base" style={{ color: LEGACY_COLORS.muted2 }}>
            조건에 맞는 AF 가 없습니다.
          </div>
        )}
        {grouped.map((group) => {
          const autoRepresentative = getAutoRepresentative(group.key, af);
          const groupCollapsed = !expandedGroups.has(group.key);
          return (
          <div key={group.key} className="border-t first:border-t-0" style={{ borderColor: LEGACY_COLORS.border }}>
            {/* 모델 그룹 제목만 접기·펼치기 동작을 담당한다. */}
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 px-2 py-2.5 text-left"
              style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)` }}
              onClick={() => toggleGroup(group.key)}
              aria-expanded={!groupCollapsed}
            >
                {groupCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                )}
                <span className="text-base font-semibold" style={{ color: LEGACY_COLORS.text }}>
                  {group.label}{" "}
                  <span className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
                    · {group.items.length}종
                  </span>
                </span>
            </button>

            <div
              data-testid="capacity-mobile-quantity-row"
              className={`${MOBILE_CAPACITY_GRID} border-t py-2`}
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              {autoRepresentative ? <div className="col-span-3 flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 basis-[12rem] [overflow-wrap:anywhere] text-base font-medium leading-6" style={{ color: LEGACY_COLORS.text }}>
                    {autoRepresentative.pf_name || autoRepresentative.pf_code}
                  </span>
                  <span className="ml-auto shrink-0 text-right text-xs leading-6" style={{ color: LEGACY_COLORS.muted2 }}>{autoRepresentative.pf_code}</span>
              </div> : <div className="col-span-3 min-w-0 text-sm font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
                자동 기준 출하 완제품 없음
              </div>}
              <MobileCapacityQuantities quantities={autoRepresentative} />
            </div>
            {/* AF 아이템 카드 */}
            {!groupCollapsed && group.items.map((it) => {
              const expanded = expandedIds.has(it.af_item_id);
              const variants = variantsByAf.get(it.af_item_id) ?? [];
              const dimmed = it.bom_status === "incomplete" || !it.has_pf_path;
              return (
                <div key={it.af_item_id} className="border-t" style={{ borderColor: LEGACY_COLORS.border }}>
                  <button
                    type="button"
                    data-testid="capacity-mobile-quantity-row"
                    onClick={() => toggleExpand(it.af_item_id)}
                    aria-expanded={expanded}
                    className={`${MOBILE_CAPACITY_GRID} min-h-11 w-full py-2 text-left transition-colors ${dimmed ? "" : "hover:brightness-110"}`}
                    style={{ background: dimmed ? LEGACY_COLORS.s2 : undefined }}
                  >
                    <div className="col-span-3 flex min-w-0 items-start gap-2">
                      {expanded ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                      )}
                      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
                        <div className="flex min-w-0 flex-1 basis-[12rem] flex-wrap items-center gap-1.5">
                          <span className="[overflow-wrap:anywhere] text-base font-medium leading-6" style={{ color: LEGACY_COLORS.text }}>
                            {it.af_name}
                          </span>
                          {it.bom_status === "incomplete" && (
                            <Badge color={LEGACY_COLORS.yellow}>BOM 미등록</Badge>
                          )}
                          {it.bom_status !== "incomplete" && !it.has_pf_path && (
                            <Badge color={LEGACY_COLORS.muted2}>출하경로 없음</Badge>
                          )}
                        </div>
                        {it.af_code && (
                          <div className="ml-auto shrink-0 text-right text-xs leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                            {it.af_code}
                          </div>
                        )}
                      </div>
                    </div>
                    <MobileCapacityQuantities quantities={it} />
                  </button>
                  {expanded && (
                    <div
                      className="border-t"
                      style={{
                        borderColor: LEGACY_COLORS.border,
                        background: `color-mix(in srgb, ${LEGACY_COLORS.text} 4%, transparent)`,
                      }}
                    >
                      <PfVariants
                        variants={variants}
                        hasPfPath={it.has_pf_path}
                        autoRepresentative={autoRepresentative}
                        showAutoRepresentativeBadge
                        onOpenBom={onOpenBom}
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

      <section
        aria-label="모델별 생산 가능수량"
        className="hidden min-h-full overflow-clip rounded-[16px] border lg:block"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <div
          aria-hidden
          className="pointer-events-none sticky top-0 z-20 -mb-4 flex h-4 justify-between"
        >
          <span
            className="h-4 w-4"
            style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 15px, var(--c-popup-bg) 16px)" }}
          />
          <span
            className="h-4 w-4"
            style={{ background: "radial-gradient(circle at 0 100%, transparent 0 15px, var(--c-popup-bg) 16px)" }}
          />
        </div>
        <div
          className={`sticky top-0 z-10 grid ${DESKTOP_CAPACITY_GRID} border-b px-4 py-4 text-sm font-bold uppercase tracking-[0.12em]`}
          style={{ background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          <span />
          <span>조립 완제품</span>
          <span>모델 수</span>
          <span>자동 기준 출하품</span>
          <span className="text-center">품목코드</span>
          <span className="text-center">출하 대기</span>
          <span className="text-center">빠른 생산</span>
          <span className="text-center">총생산</span>
        </div>

        {grouped.map((group) => {
          const autoRepresentative = getAutoRepresentative(group.key, af);
          const groupCollapsed = !expandedGroups.has(group.key);
          return (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                aria-expanded={!groupCollapsed}
                className={`grid w-full ${DESKTOP_CAPACITY_GRID} items-center border-t px-4 py-5 text-left`}
                style={{
                  borderColor: LEGACY_COLORS.border,
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
                }}
              >
                {groupCollapsed ? (
                  <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
                ) : (
                  <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
                )}
                <span className="text-base font-black" style={{ color: LEGACY_COLORS.blue }}>
                  {group.label}
                </span>
                <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {group.items.length}종
                </span>
                <span className="min-w-0">
                  {autoRepresentative ? (
                    <span
                      className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-sm font-bold"
                      style={{
                        background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 14%, transparent)`,
                        color: LEGACY_COLORS.cyan,
                      }}
                    >
                      <span className="truncate">{autoRepresentative.pf_name || autoRepresentative.pf_code}</span>
                    </span>
                  ) : (
                    <span style={{ color: LEGACY_COLORS.muted2 }}>출하 경로 없음</span>
                  )}
                </span>
                <span className="truncate text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {autoRepresentative?.pf_code || "—"}
                </span>
                {autoRepresentative ? (
                  <>
                    <QtyCell value={autoRepresentative.ship_ready} color={LEGACY_COLORS.cyan} />
                    <QtyCell value={autoRepresentative.fast_production} color={LEGACY_COLORS.blue} />
                    <QtyCell value={autoRepresentative.total_production} color={LEGACY_COLORS.purple} />
                  </>
                ) : (
                  <>
                    <QtyCell value={null} color={LEGACY_COLORS.muted2} />
                    <QtyCell value={null} color={LEGACY_COLORS.muted2} />
                    <QtyCell value={null} color={LEGACY_COLORS.muted2} />
                  </>
                )}
              </button>

              {!groupCollapsed && group.items.map((item) => {
                const expanded = expandedIds.has(item.af_item_id);
                const variants = variantsByAf.get(item.af_item_id) ?? [];
                const dimmed = item.bom_status === "incomplete" || !item.has_pf_path;
                return (
                  <div key={item.af_item_id}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.af_item_id)}
                      aria-expanded={expanded}
                      className={`grid w-full ${DESKTOP_CAPACITY_GRID} items-center border-t px-4 py-2.5 text-left transition-colors ${dimmed ? "" : "hover:brightness-110"}`}
                      style={{
                        borderColor: LEGACY_COLORS.border,
                        background: dimmed ? LEGACY_COLORS.s2 : undefined,
                      }}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
                      ) : (
                        <ChevronRight className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
                      )}
                      <span className="col-span-3 min-w-0 pr-4">
                        <span className="flex items-center gap-1.5">
                          <span className="text-base leading-5" style={{ color: LEGACY_COLORS.text }}>
                            {item.af_name}
                          </span>
                          {item.bom_status === "incomplete" && <Badge color={LEGACY_COLORS.yellow}>BOM 미등록</Badge>}
                          {item.bom_status !== "incomplete" && !item.has_pf_path && <Badge color={LEGACY_COLORS.muted2}>출하경로 없음</Badge>}
                        </span>
                        {item.af_code && <span className="block text-sm lg:hidden" style={{ color: LEGACY_COLORS.muted2 }}>{item.af_code}</span>}
                      </span>
                      <span className="hidden truncate text-center text-sm font-bold lg:block" style={{ color: LEGACY_COLORS.muted2 }}>
                        {item.af_code || "—"}
                      </span>
                      <QtyCell value={item.ship_ready} color={LEGACY_COLORS.cyan} />
                      <QtyCell value={item.fast_production} color={LEGACY_COLORS.blue} />
                      <QtyCell value={item.total_production} color={LEGACY_COLORS.purple} />
                    </button>

                    {expanded && (
                      <div
                        className="border-t px-4 py-3 lg:px-0 lg:py-0"
                        style={{
                          borderColor: LEGACY_COLORS.border,
                          background: `color-mix(in srgb, ${LEGACY_COLORS.text} 4%, transparent)`,
                        }}
                      >
                        <PfVariants
                          variants={variants}
                          hasPfPath={item.has_pf_path}
                          autoRepresentative={autoRepresentative}
                          onOpenBom={onOpenBom}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

    </>
  );
}

/** 모든 모바일 행에서 같은 열 순서와 빈 수량 표시를 유지한다. */
function MobileCapacityQuantities({ quantities }: {
  quantities: Pick<ProductionCapacityPfVariant, "ship_ready" | "fast_production" | "total_production"> | null;
}): ReactNode {
  return (
    <>
      <QtyCell value={quantities?.ship_ready ?? null} color={LEGACY_COLORS.cyan} />
      <QtyCell value={quantities?.fast_production ?? null} color={LEGACY_COLORS.blue} />
      <QtyCell value={quantities?.total_production ?? null} color={LEGACY_COLORS.purple} />
    </>
  );
}

function QtyCell({ value, color }: { value: number | null; color: string }) {
  return (
    <span
      className="text-center text-base font-bold"
      style={{ color: value && value > 0 ? color : LEGACY_COLORS.muted2 }}
    >
      {value == null ? "—" : formatQty(value)}
    </span>
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
  autoRepresentative,
  showAutoRepresentativeBadge = false,
  onOpenBom,
}: {
  variants: ProductionCapacityPfVariant[];
  hasPfPath: boolean;
  autoRepresentative?: ProductionCapacityPfVariant | null;
  showAutoRepresentativeBadge?: boolean;
  onOpenBom?: (variant: ProductionCapacityPfVariant) => void;
}) {
  if (variants.length === 0) {
    return (
      <div className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
        <AlertCircle className="h-4 w-4 shrink-0" />
        <Badge color={LEGACY_COLORS.muted2}>{hasPfPath ? "출하 완제품 없음" : "출하 경로 없음"}</Badge>
        <span>{hasPfPath ? "연결된 출하 완제품 정보가 없습니다." : "연결된 출하 완제품이 없습니다."}</span>
      </div>
    );
  }
  if (showAutoRepresentativeBadge) {
    return <div>
      {variants.map((variant) => (
        <div
          key={variant.pf_item_id}
          data-testid="capacity-mobile-quantity-row"
          className={`${MOBILE_CAPACITY_GRID} border-t py-2 first:border-t-0`}
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          <div className="col-span-3 flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1 basis-[12rem]">
              <div className="text-base font-medium leading-6 [overflow-wrap:anywhere]" style={{ color: LEGACY_COLORS.text }}>{variant.pf_name}</div>
              {autoRepresentative?.pf_item_id === variant.pf_item_id && autoRepresentative.af_item_id === variant.af_item_id && (
                <span className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-xs font-medium" style={{ color: LEGACY_COLORS.cyan, background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 15%, transparent)` }}>자동 기준</span>
              )}
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
              {variant.pf_code && <div className="text-right text-xs leading-6" style={{ color: LEGACY_COLORS.muted2 }}>{variant.pf_code}</div>}
              {onOpenBom && <button
                type="button"
                onClick={() => onOpenBom(variant)}
                aria-label={`${variant.pf_name || variant.pf_code} BOM 보기`}
                className="standard-hover min-h-11 rounded-[10px] border px-3 text-sm font-medium active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
              >BOM 보기</button>}
            </div>
          </div>
          <MobileCapacityQuantities quantities={variant} />
        </div>
      ))}
    </div>;
  }
  return (
    <div>
      <div className="mb-1 text-sm font-bold lg:hidden" style={{ color: LEGACY_COLORS.muted2 }}>
        출고처별 출하 준비 가능
      </div>
      {variants.map((v) => {
        const isAutoRepresentative =
          autoRepresentative?.pf_item_id === v.pf_item_id &&
          autoRepresentative.af_item_id === v.af_item_id;
        return (
          <div
            key={v.pf_item_id}
            className={`grid grid-cols-3 ${DESKTOP_PF_GRID} items-center gap-2 border-t px-2 py-2.5 lg:gap-0 lg:px-4 lg:py-2.5`}
            style={{ borderColor: LEGACY_COLORS.border }}
          >
            <div className="col-span-3 min-w-0 lg:hidden">
              <div className="flex flex-col items-start gap-2">
                <div className="w-full min-w-0">
                  <div className="[overflow-wrap:anywhere] text-sm leading-5" style={{ color: LEGACY_COLORS.text }}>
                    {v.pf_name}
                    {v.pf_code && (
                      <span className="mt-1 block break-all text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        {v.pf_code}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {showAutoRepresentativeBadge && isAutoRepresentative && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-xs font-medium"
                      style={{
                        color: LEGACY_COLORS.cyan,
                        background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 15%, transparent)`,
                      }}
                    >
                      자동 기준
                    </span>
                  )}
                  {onOpenBom && (
                    <button
                      type="button"
                      onClick={() => onOpenBom(v)}
                      className="standard-hover hidden min-h-11 items-center rounded-[10px] border px-3 text-sm font-bold transition-[filter] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] lg:inline-flex"
                      style={{
                        background: LEGACY_COLORS.s2,
                        borderColor: LEGACY_COLORS.border,
                        color: LEGACY_COLORS.blue,
                      }}
                      aria-label={`${v.pf_name || v.pf_code} BOM 확인`}
                    >
                      BOM 확인
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="col-span-4 hidden min-w-0 grid-cols-[minmax(0,1fr)_72px] items-center gap-2 pl-5 pr-8 lg:grid">
              <div className="min-w-0 break-words text-sm leading-5" style={{ color: LEGACY_COLORS.text }}>
                {v.pf_name}
              </div>
              <span className="justify-self-center">
                {onOpenBom && (
                  <button
                    type="button"
                    onClick={() => onOpenBom(v)}
                    className="standard-hover min-h-11 rounded-[10px] border px-3 text-sm font-bold transition-[filter] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
                    style={{
                      background: LEGACY_COLORS.s2,
                      borderColor: LEGACY_COLORS.border,
                      color: LEGACY_COLORS.blue,
                    }}
                    aria-label={`${v.pf_name || v.pf_code} BOM 확인`}
                  >
                    BOM 확인
                  </button>
                )}
              </span>
            </div>
            <span className="hidden truncate text-center text-sm font-bold lg:block" style={{ color: LEGACY_COLORS.muted2 }}>
              {v.pf_code || "—"}
            </span>
            <div
              className="text-center text-base font-semibold lg:font-bold"
              style={{ color: v.ship_ready > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
            >
              <span className="mb-1 block text-xs font-normal lg:hidden" style={{ color: LEGACY_COLORS.muted2 }}>출하 대기</span>
              {formatQty(v.ship_ready)}
            </div>
            <div
              className="text-center text-base font-semibold lg:font-bold"
              style={{ color: v.fast_production > 0 ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
            >
              <span className="mb-1 block text-xs font-normal lg:hidden" style={{ color: LEGACY_COLORS.muted2 }}>빠른 생산</span>
              {formatQty(v.fast_production)}
            </div>
            <div
              className="text-center text-base font-semibold lg:font-bold"
              style={{ color: v.total_production > 0 ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2 }}
            >
              <span className="mb-1 block text-xs font-normal lg:hidden" style={{ color: LEGACY_COLORS.muted2 }}>총생산</span>
              {formatQty(v.total_production)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
