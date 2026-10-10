"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsDownUp, ChevronsUpDown, GitBranch, X } from "lucide-react";
import Image from "next/image";
import { formatQty } from "@/lib/mes/format";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { DesktopPanelCloseButton } from "../DesktopRightPanel";
import { EmptyState } from "../common/EmptyState";
import { DesktopBomExpandControls } from "../common/DesktopBomExpandControls";
import { getBomBranchItemIds, ModalBomTree, useBomTree } from "../_warehouse_v2/BomSubExpander";
import { ReadFailure, ReadLoading } from "../common/ReadState";
import { SkeletonBlock, dataRevealClassName } from "../common/LoadingSkeleton";

type Props = {
  itemId: string;
  open: boolean;
  onClose: () => void;
  mobilePresentation?: boolean;
};

export function BomDetailModal({ itemId, open, onClose, mobilePresentation = false }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(open, { initialFocusRef: closeRef });
  const [mounted, setMounted] = useState(false);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => new Set());
  const { tree, retry, refreshError } = useBomTree(itemId, open, mobilePresentation ? undefined : "desc");
  const currentTree = tree && tree.item_id === itemId ? tree : null;
  const isTreeLoading = tree === null || (tree !== false && currentTree === null);
  const branchItemIds = currentTree ? getBomBranchItemIds(currentTree) : [];
  const hasExpandedItems = branchItemIds.some((branchItemId) => expandedItemIds.has(branchItemId));
  const hasCollapsedItems = branchItemIds.some((branchItemId) => !expandedItemIds.has(branchItemId));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setExpandedItemIds(new Set());
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
      style={{ background: LEGACY_COLORS.bg }}
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
        className={mobilePresentation ? "flex h-[88dvh] w-full max-w-[720px] min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border" : "flex h-[84vh] w-[calc(100vw-128px)] min-h-0 flex-col overflow-hidden rounded-[24px] border"}
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
        ) : <div data-testid="bom-modal-header" className="flex shrink-0 items-center gap-4 border-b px-6 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="shrink-0">
            <div id={titleId} className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
              BOM 구성 보기
            </div>
            <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              읽기 전용 · 구성품별 현재 총 재고
            </p>
          </div>
          {currentTree && <div className="flex min-w-0 flex-1 items-center gap-3 border-l pl-4" style={{ borderColor: LEGACY_COLORS.border }}>
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
            <span
              data-testid="bom-current-stock-badge"
              className="ml-auto shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold tabular-nums"
              style={{ color: currentTree.current_stock === 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
            >
              현재 재고 {formatQty(currentTree.current_stock)} {currentTree.unit}
            </span>
          </div>}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {currentTree && <span
              data-testid="bom-additional-producible-badge"
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold tabular-nums"
              style={{
                color: currentTree.additional_producible_quantity && currentTree.additional_producible_quantity > 0
                  ? LEGACY_COLORS.purple
                  : LEGACY_COLORS.muted2,
                background: currentTree.additional_producible_quantity && currentTree.additional_producible_quantity > 0
                  ? tint(LEGACY_COLORS.purple, 12)
                  : LEGACY_COLORS.s2,
              }}
            >
              {typeof currentTree.additional_producible_quantity === "number"
                ? `추가 생산 가능 ${formatQty(currentTree.additional_producible_quantity)} ${currentTree.unit}`
                : "추가 생산 가능 계산 불가"}
            </span>}
            <DesktopBomExpandControls
              hasCollapsedItems={hasCollapsedItems}
              hasExpandedItems={hasExpandedItems}
              onExpand={() => setExpandedItemIds(new Set(branchItemIds))}
              onCollapse={() => setExpandedItemIds(new Set())}
            />
          <DesktopPanelCloseButton
            ref={closeRef}
            onClick={onClose}
            ariaLabel="닫기"
          />
          </div>
        </div>}
        <div className={mobilePresentation ? "flex min-h-0 min-w-0 flex-1 flex-col px-3 py-3" : "flex min-h-0 flex-1 flex-col px-6 py-4"}>
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
          ) : <ModalBomTree showStockBreakdown={!mobilePresentation} mobilePresentation={mobilePresentation} tree={currentTree} expandedItemIds={expandedItemIds} onToggleItem={toggleItem} />}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
