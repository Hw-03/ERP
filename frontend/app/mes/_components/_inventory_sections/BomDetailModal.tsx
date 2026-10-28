"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsDownUp, ChevronsUpDown, GitBranch, LocateFixed, X } from "lucide-react";
import Image from "next/image";
import { formatQty } from "@/lib/mes/format";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { EmptyState } from "../common/EmptyState";
import { getBomBranchItemIds, ModalBomTree, useBomTree } from "../_warehouse_v2/BomSubExpander";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { SkeletonBlock, dataRevealClassName } from "../common/LoadingSkeleton";
import { MOBILE_MODAL_VIEWPORT_STYLE } from "../mobile/mobileModalLayout";
import { api } from "@/lib/api";
import type { BOMCapacitySimulation } from "@/lib/api/types/catalog";
import { useRealtimeRevision } from "@/lib/queries/realtime";

type Props = {
  itemId: string;
  open: boolean;
  onClose: () => void;
  mobilePresentation?: boolean;
};
type CapacityField = "fast_production" | "total_production";

export function BomDetailModal({ itemId, open, onClose, mobilePresentation = false }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(open && mounted, { initialFocusRef: closeRef });
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => new Set());
  const revision = useRealtimeRevision();
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(() => new Set());
  const exclusionItemIdRef = useRef(itemId);
  const [simulation, setSimulation] = useState<{ selection: string; value: BOMCapacitySimulation } | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [highlight, setHighlight] = useState<{ itemId: string; sequence: number; field: CapacityField } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const selection = exclusionItemIdRef.current === itemId ? [...excludedItemIds].sort().join(",") : "";
  const calculationKey = `${selection}:${revision ?? "initial"}:${attempt}`;
  const simulating = !mobilePresentation && selection.length > 0;
  const currentSimulation = simulation?.selection === selection && simulation.value.item_id === itemId ? simulation.value : null;
  const failed = simulationError === calculationKey;
  const { tree, retry, refreshError } = useBomTree(itemId, open, mobilePresentation ? undefined : "desc");
  const currentTree = tree && tree.item_id === itemId ? tree : null;
  const isTreeLoading = tree === null || (tree !== false && currentTree === null);
  const branchItemIds = currentTree ? getBomBranchItemIds(currentTree) : [];
  const hasExpandedItems = branchItemIds.some((branchItemId) => expandedItemIds.has(branchItemId));
  const hasCollapsedItems = branchItemIds.some((branchItemId) => !expandedItemIds.has(branchItemId));
  const limitingId = (field: CapacityField): string | null => {
    const source = simulating ? currentSimulation : currentTree;
    const status = source?.[`${field}_status`];
    if (status === "no_constraints" || status === "unavailable") return null;
    if (simulating) return currentSimulation?.[`${field}_limiting_item_id`] ?? null;
    return currentTree?.[`${field}_limiting_item_id`] ?? (field === "total_production" ? currentTree?.additional_producible_limiting_item_id : null) ?? null;
  };

  useEffect(() => {
    if (!open || mobilePresentation || !selection) return;
    let active = true;
    const controller = new AbortController();
    setSimulationError(null);
    const timer = window.setTimeout(() => {
      api.simulateBOMCapacity(itemId, { excluded_item_ids: selection.split(",") }, controller.signal)
        .then((value) => { if (active) setSimulation({ selection, value }); })
        .catch(() => { if (active) setSimulationError(calculationKey); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [open, mobilePresentation, itemId, selection, calculationKey]);

  useEffect(() => {
    if (!currentTree || mobilePresentation) return;
    const valid = new Set<string>();
    const visit = (node: typeof currentTree): void => {
      if (node.item_id !== itemId) valid.add(node.item_id);
      node.children.forEach(visit);
    };
    visit(currentTree);
    setExcludedItemIds((current) => {
      const next = new Set([...current].filter((id) => valid.has(id)));
      return current.size === next.size ? current : next;
    });
  }, [currentTree, itemId, mobilePresentation]);

  useEffect(() => {
    if (!highlight) return;
    const row = Array.from(tableRef.current?.querySelectorAll<HTMLElement>("[data-bom-item-id]") ?? [])
      .find((element) => element.dataset.bomItemId === highlight.itemId && element.dataset.bomExcluded !== "true");
    row?.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    const timer = window.setTimeout(() => setHighlight(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const findPath = (target: string): string[] | null => {
    if (!currentTree) return null;
    const visit = (node: typeof currentTree, path: string[]): string[] | null => {
      if (excludedItemIds.has(node.item_id)) return null;
      if (node.item_id === target) return path;
      for (const child of node.children) {
        const found = visit(child, [...path, node.item_id]);
        if (found) return found;
      }
      return null;
    };
    for (const child of currentTree.children) {
      const found = visit(child, []);
      if (found) return found;
    }
    return null;
  };
  const locateLimitingItem = (field: CapacityField): void => {
    const limitingItemId = limitingId(field);
    if (!limitingItemId) return;
    const path = findPath(limitingItemId);
    if (!path) return;
    setExpandedItemIds((current) => new Set([...current, ...path]));
    setHighlight((current) => ({ itemId: limitingItemId, sequence: (current?.sequence ?? 0) + 1, field }));
  };
  const toggleExcluded = (target: string): void => {
    setSimulation(null);
    setHighlight(null);
    setExcludedItemIds((current) => {
      const next = new Set(current);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  };
  const productionValue = (field: CapacityField): number | string => {
    if (simulating && !currentSimulation) return failed ? "—" : "계산 중…";
    const source = simulating ? currentSimulation : currentTree;
    if (source?.[`${field}_status`] === "no_constraints") return "제약 없음";
    const quantity = source?.[field];
    if (typeof quantity === "number") return quantity;
    if (!simulating && field === "total_production" && currentTree?.total_production === undefined && typeof currentTree?.additional_producible_quantity === "number") {
      return currentTree.current_stock + currentTree.additional_producible_quantity;
    }
    return "계산 불가";
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    exclusionItemIdRef.current = itemId;
    setExpandedItemIds(new Set());
    setExcludedItemIds(new Set());
    setSimulation(null);
    setSimulationError(null);
    setHighlight(null);
  }, [itemId, open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const toggleItem = (itemIdToToggle: string) => {
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemIdToToggle)) next.delete(itemIdToToggle);
      else next.add(itemIdToToggle);
      return next;
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: LEGACY_COLORS.bg, ...(mobilePresentation ? MOBILE_MODAL_VIEWPORT_STYLE : {}) }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={mobilePresentation ? descriptionId : undefined}
      onClick={onClose}
      onTouchStart={mobilePresentation ? (event) => event.stopPropagation() : undefined}
      onTouchMove={mobilePresentation ? (event) => event.stopPropagation() : undefined}
      onTouchEnd={mobilePresentation ? (event) => event.stopPropagation() : undefined}
      onTouchCancel={mobilePresentation ? (event) => event.stopPropagation() : undefined}
    >
      <div
        ref={panelRef}
        data-testid="bom-detail-modal-panel"
        className={mobilePresentation ? "flex h-full w-full max-w-[720px] min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border" : "flex h-[84vh] w-[calc(100vw-128px)] min-h-0 flex-col overflow-hidden rounded-[24px] border"}
        style={{
          background: "var(--c-popup-bg)",
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {mobilePresentation ? (
          <div data-testid="bom-modal-header" className="shrink-0 border-b px-3 pb-2 pt-1" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="flex items-center gap-1">
              <div id={titleId} className="min-w-0 flex-1 text-base font-bold">BOM 구성 보기</div>
              <button type="button" onClick={() => setExpandedItemIds(new Set(branchItemIds))} disabled={!hasCollapsedItems} aria-label="모두 펼치기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"><ChevronsUpDown className="h-5 w-5" /></button>
              <button type="button" onClick={() => setExpandedItemIds(new Set())} disabled={!hasExpandedItems} aria-label="모두 접기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"><ChevronsDownUp className="h-5 w-5" /></button>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p id={descriptionId} className="sr-only">읽기 전용 · 구성품별 현재 총 재고</p>
            {currentTree && <>
              <p className="text-sm font-bold [overflow-wrap:anywhere]">{currentTree.item_name}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                <span className="[overflow-wrap:anywhere]">{currentTree.mes_code}</span>
                <span data-testid="bom-current-stock-badge">현재 재고 {formatQty(currentTree.current_stock)} {currentTree.unit}</span>
                <span data-testid="bom-additional-producible-badge">{typeof currentTree.additional_producible_quantity === "number" ? `추가 생산 가능 ${formatQty(currentTree.additional_producible_quantity)} ${currentTree.unit}` : "추가 생산 가능 계산 불가"}</span>
              </div>
            </>}
            {isTreeLoading && <div role="status" aria-busy="true" aria-label="품목 재고 정보를 불러오는 중">
              <SkeletonBlock className="h-5 w-2/3" />
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <SkeletonBlock className="h-4 w-20" />
                <span className="flex items-center gap-1">현재 재고 <SkeletonBlock className="h-4 w-12" /></span>
                <span className="flex items-center gap-1">추가 생산 가능 <SkeletonBlock className="h-4 w-12" /></span>
              </div>
            </div>}
          </div>
        ) : <div data-testid="bom-modal-header" className="flex shrink-0 flex-col gap-3 border-b px-4 py-4 xl:flex-row xl:items-center xl:gap-4 xl:px-6" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="shrink-0">
            <div id={titleId} className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
              BOM 구성 보기
            </div>
            <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              읽기 전용 · 구성품별 현재 총 재고
            </p>
          </div>
          {currentTree && <div className="flex min-w-0 flex-1 items-center gap-3 xl:border-l xl:pl-4" style={{ borderColor: LEGACY_COLORS.border }}>
            <span
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-black"
              style={{ color: LEGACY_COLORS.blue, background: tint(LEGACY_COLORS.blue, 12) }}
            >
              <GitBranch className="h-4 w-4" />
              BOM
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{currentTree.item_name}</p>
              <p className="font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{currentTree.mes_code}</p>
            </div>
          </div>}
          <div className="ml-auto flex w-full shrink-0 items-center gap-2 xl:w-auto">
            {simulating && <button type="button" onClick={() => { setExcludedItemIds(new Set()); setSimulation(null); setHighlight(null); }} className="h-16 shrink-0 rounded-[10px] border px-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]" style={{ color: LEGACY_COLORS.yellow, background: LEGACY_COLORS.warningBg, borderColor: LEGACY_COLORS.yellow }}>전체 초기화</button>}
            {currentTree && <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 xl:w-auto xl:grid-cols-[7.5rem_7.5rem_7.5rem]">
              {[
                { label: "현재 재고", field: null, testId: "bom-current-stock-badge", value: currentTree.current_stock, color: LEGACY_COLORS.cyan },
                { label: "빠른 생산", field: "fast_production" as const, testId: "bom-fast-production-card", value: productionValue("fast_production"), color: LEGACY_COLORS.blue },
                { label: "총생산", field: "total_production" as const, testId: "bom-additional-producible-badge", value: productionValue("total_production"), color: LEGACY_COLORS.purple },
              ].map(({ label, field, testId, value, color }) => {
                const Card = field ? "button" : "div";
                const target = field ? limitingId(field) : null;
                return <Card key={label} type={field ? "button" : undefined} data-testid={testId}
                  aria-label={field ? `${label} 제한 품목 찾기` : undefined}
                  disabled={field ? !target || findPath(target) === null : undefined}
                  onClick={field ? () => locateLimitingItem(field) : undefined}
                  className="flex h-16 min-w-0 flex-col justify-center rounded-[14px] border px-3 py-2 enabled:hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
                  style={{ background: simulating ? LEGACY_COLORS.warningBg : LEGACY_COLORS.s2, borderColor: simulating ? LEGACY_COLORS.yellow : LEGACY_COLORS.border }}>
                  <div className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}><span className="relative inline-block">{label}{field && <LocateFixed aria-hidden className="absolute left-full top-1/2 ml-1 h-3.5 w-3.5 -translate-y-1/2" />}</span></div>{" "}
                  <div className="mt-0.5 text-center text-lg font-black tabular-nums" style={{ color }}>{typeof value === "number" ? formatQty(value) : value}</div>
                </Card>;
              })}
            </div>}
            <button
              type="button"
              onClick={() => setExpandedItemIds(new Set(branchItemIds))}
              disabled={!hasCollapsedItems}
              className="h-16 shrink-0 rounded-[10px] border px-3 text-xs font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
            >
              모두 펼치기
            </button>
            <button
              type="button"
              onClick={() => setExpandedItemIds(new Set())}
              disabled={!hasExpandedItems}
              className="h-16 shrink-0 rounded-[10px] border px-3 text-xs font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
            >
              모두 접기
            </button>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="flex h-16 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110" style={{ color: LEGACY_COLORS.red }}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: tint(LEGACY_COLORS.red, 15) }}><X className="h-4 w-4" /></span>
            </button>
          </div>
        </div>}
        <div ref={tableRef} className={mobilePresentation ? "flex min-h-0 min-w-0 flex-1 flex-col px-3 py-3" : "flex min-h-0 flex-1 flex-col px-6 py-4"}>
          {isTreeLoading && (mobilePresentation ? <ReadLoading label="BOM 구성을 불러오는 중…" skeleton={
            <div className="overflow-clip rounded-[14px] border" style={{ borderColor: LEGACY_COLORS.border }}>
              {[0, 1, 2, 3].map((index) => <div key={index} data-testid="bom-mobile-skeleton-row" className="min-w-0 border-b py-3 px-3" style={{ borderColor: LEGACY_COLORS.border }}>
                <div className="flex min-w-0 items-start gap-1"><SkeletonBlock className="h-11 w-11 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 py-2"><SkeletonBlock className="h-5 w-2/3" /><SkeletonBlock className="h-4 w-1/3" /></div>
                </div>
                <div className="mt-1 flex flex-col gap-0.5"><SkeletonBlock className="h-4 w-20" /><SkeletonBlock className="h-6 w-14" /></div>
              </div>)}
            </div>
          } /> : <div
            role="status"
            aria-busy="true"
            aria-label="BOM 구성을 불러오는 중…"
            className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[18px] border px-4 py-8 text-center text-sm"
            style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <Image src="/images/dexray/history-empty.webp" alt="" width={540} height={360} className="h-32 w-auto object-contain" />
            <span>BOM 구성을 불러오는 중…</span>
          </div>)}
          {mobilePresentation && refreshError && <ReadFailure message={refreshError} onRetry={retry} refresh />}
          {tree === false && <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div
              className="rounded-[18px] border px-4 py-5 text-center text-sm"
              style={{ color: LEGACY_COLORS.red, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              하위 구성을 불러오지 못했습니다.
            </div>
            <button
              type="button"
              onClick={retry}
              className="min-h-11 rounded-[10px] border px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
              style={{ borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red, background: LEGACY_COLORS.s2 }}
            >
              다시 시도
            </button>
          </div>}
          {currentTree && <div className={`flex min-h-0 flex-1 flex-col ${mobilePresentation ? dataRevealClassName : ""}`}>{currentTree.children.length === 0 ? (
            <EmptyState compact illustrated className="flex-1 rounded-[18px] border border-[var(--c-border)] bg-[var(--c-s2)]" title="하위 품목이 없습니다." description="" />
          ) : <ModalBomTree
            showStockBreakdown={!mobilePresentation}
            mobilePresentation={mobilePresentation}
            tree={currentTree}
            expandedItemIds={expandedItemIds}
            onToggleItem={toggleItem}
            allowTopLevelExclusion={!mobilePresentation}
            excludedItemIds={!mobilePresentation ? excludedItemIds : undefined}
            onToggleExcluded={!mobilePresentation ? toggleExcluded : undefined}
            highlightedItemId={!mobilePresentation ? highlight?.itemId : undefined}
            highlightDescription={highlight?.field === "total_production" ? "총생산 수량에는 현재 재고가 포함됩니다." : undefined}
            headerNotice={simulating ? <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-normal" style={{ color: LEGACY_COLORS.yellow }}>
              <span className="font-bold" role="status">시뮬레이션 중</span>
              <span>{excludedItemIds.size}개 제외 · 실제 BOM은 변경되지 않습니다.</span>
              {failed && <span role="alert" className="flex flex-wrap items-center justify-center gap-2" style={{ color: LEGACY_COLORS.red }}>
                <span>{currentSimulation ? "최신 계산 갱신 실패" : "시뮬레이션 계산에 실패했습니다."}</span>
                <button type="button" className="min-h-11 rounded-[10px] border px-2 font-bold" style={{ borderColor: LEGACY_COLORS.red }} onClick={() => setAttempt((value) => value + 1)}>계산 다시 시도</button>
              </span>}
            </span> : undefined}
          />}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
