"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, GitBranch, LocateFixed, X } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import type { ProductionCapacityPfVariant, ProductionCapacitySimulation } from "@/lib/api/types/production";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import {
  getBomBranchItemIds,
  ModalBomTree,
  useBomTree,
} from "../_warehouse_v2/BomSubExpander";
import { EmptyState } from "../common/EmptyState";

type Props = {
  variant: ProductionCapacityPfVariant;
  onBack: () => void;
  onClose: () => void;
};

function SummaryCard({
  label,
  value,
  color,
  simulating = false,
  onLocate,
  canLocate = false,
}: {
  label: string;
  value: number | string;
  color: string;
  simulating?: boolean;
  onLocate?: () => void;
  canLocate?: boolean;
}) {
  const Card = onLocate ? "button" : "div";
  return (
    <Card
      type={onLocate ? "button" : undefined}
      onClick={onLocate}
      disabled={onLocate ? !canLocate : undefined}
      aria-label={onLocate ? `${label} 제한 품목 찾기` : undefined}
      className="flex h-16 min-w-0 flex-col justify-center rounded-[14px] border px-3 py-2 enabled:hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{ background: simulating ? LEGACY_COLORS.warningBg : LEGACY_COLORS.s2, borderColor: simulating ? LEGACY_COLORS.yellow : LEGACY_COLORS.border }}
    >
      <div className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        <span className="relative inline-block">{label}{onLocate && <LocateFixed aria-hidden className="absolute left-full top-1/2 ml-1 h-3.5 w-3.5 -translate-y-1/2" />}</span>
      </div>
      <div className="mt-0.5 text-center text-lg font-black tabular-nums" style={{ color }}>
        {typeof value === "number" ? formatQty(value) : value}
      </div>
    </Card>
  );
}

/** 선택한 출하 완제품(PF)의 세 수량과 전체 BOM을 전용으로 표시한다. */
export function DesktopCapacityPfWorkspace({ variant, onBack, onClose }: Props) {
  return <PfWorkspace key={variant.pf_item_id} variant={variant} onBack={onBack} onClose={onClose} />;
}

function PfWorkspace({ variant, onBack, onClose }: Props) {
  const { tree, error, retry } = useBomTree(variant.pf_item_id, true, "desc");
  const revision = useRealtimeRevision();
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(() => new Set());
  const [simulation, setSimulation] = useState<{ selectionKey: string; value: ProductionCapacitySimulation } | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [highlight, setHighlight] = useState<{ itemId: string; sequence: number; field: "fast_production" | "total_production" } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const selectionKey = [...excludedItemIds].sort().join(",");
  const calculationKey = `${selectionKey}:${revision ?? "initial"}:${attempt}`;
  const simulating = excludedItemIds.size > 0;
  const currentSimulation = simulation?.selectionKey === selectionKey ? simulation.value : null;
  const failed = simulationError === calculationKey;
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => new Set());
  const expandedPfRef = useRef<string | null>(null);
  const currentTree = tree && tree.item_id === variant.pf_item_id ? tree : null;
  const branchItemIds = currentTree ? getBomBranchItemIds(currentTree) : [];
  const hasExpandedItems = branchItemIds.some((itemId) => expandedItemIds.has(itemId));
  const hasCollapsedItems = branchItemIds.some((itemId) => !expandedItemIds.has(itemId));

  useEffect(() => {
    if (!selectionKey) return;
    let active = true;
    const controller = new AbortController();
    setSimulationError(null);
    const timer = window.setTimeout(() => {
      api.simulateProductionCapacity({ pf_item_id: variant.pf_item_id, excluded_item_ids: selectionKey.split(",") }, controller.signal)
        .then((value) => { if (active) setSimulation({ selectionKey, value }); })
        .catch(() => { if (active) setSimulationError(calculationKey); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [calculationKey, selectionKey, variant.pf_item_id]);

  useEffect(() => {
    if (!currentTree) return;
    const validIds = new Set<string>();
    const visit = (node: typeof currentTree, depth: number): void => {
      if (depth > 0) validIds.add(node.item_id);
      node.children.forEach((child) => visit(child, depth + 1));
    };
    currentTree.children.forEach((child) => visit(child, 0));
    currentTree.children.forEach((child) => validIds.delete(child.item_id));
    setExcludedItemIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [currentTree]);

  const toggleExcluded = (itemId: string): void => {
    setHighlight(null);
    setSimulation(null);
    setExcludedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };
  const simulatedValue = (field: "fast_production" | "total_production"): number | string => {
    if (!simulating) return variant[field];
    if (!currentSimulation) return failed ? "—" : "계산 중…";
    return currentSimulation[`${field}_status`] === "no_constraints" ? "제약 없음" : currentSimulation[field] ?? "—";
  };

  useEffect(() => {
    if (!currentTree || expandedPfRef.current === variant.pf_item_id) return;
    setExpandedItemIds(new Set(getBomBranchItemIds(currentTree)));
    expandedPfRef.current = variant.pf_item_id;
  }, [currentTree, variant.pf_item_id]);

  const toggleItem = (itemId: string) => {
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const limitingId = (field: "fast_production" | "total_production"): string | null => {
    const source = simulating ? currentSimulation : variant;
    return source?.[`${field}_limiting_item_id`] ?? null;
  };
  const findPath = (itemId: string): string[] | null => {
    if (!currentTree) return null;
    const visit = (node: typeof currentTree, path: string[]): string[] | null => {
      if (excludedItemIds.has(node.item_id)) return null;
      if (node.item_id === itemId) return path;
      for (const child of node.children) {
        const found = visit(child, [...path, node.item_id]);
        if (found) return found;
      }
      return null;
    };
    for (const child of currentTree.children) {
      const path = visit(child, []);
      if (path) return path;
    }
    return null;
  };
  const locate = (field: "fast_production" | "total_production"): void => {
    const itemId = limitingId(field);
    if (!itemId) return;
    const path = findPath(itemId);
    if (!path) return;
    setExpandedItemIds((current) => new Set([...current, ...path]));
    setHighlight((current) => ({ itemId, sequence: (current?.sequence ?? 0) + 1, field }));
  };
  useEffect(() => {
    if (!highlight) return;
    const row = Array.from(tableRef.current?.querySelectorAll<HTMLElement>("[data-bom-item-id]") ?? [])
      .find((element) => element.dataset.bomItemId === highlight.itemId && element.dataset.bomExcluded !== "true");
    row?.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    const timer = window.setTimeout(() => setHighlight(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  return (
    <section
      aria-label="선택한 출하 완제품 BOM"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 2xl:flex-row 2xl:items-center xl:gap-4 xl:px-6 xl:py-4" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-bold transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
            style={{ color: LEGACY_COLORS.blue }}
            aria-label="생산 가능수량으로 돌아가기"
          >
            <ChevronLeft className="h-4 w-4" />
            생산 가능수량으로 돌아가기
          </button>
          <div className="hidden shrink-0 border-l pl-3 xl:block" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
              BOM 구성 보기
            </div>
            <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              읽기 전용 · 구성품별 현재 총 재고
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3 xl:border-l xl:pl-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-black"
            style={{
              color: LEGACY_COLORS.blue,
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
            }}
          >
            <GitBranch className="h-4 w-4" />
            BOM
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
              {variant.pf_name || variant.pf_code}
            </p>
            <p className="font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {variant.pf_code || "-"}
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 xl:w-auto">
          {simulating && <button type="button" onClick={() => { setExcludedItemIds(new Set()); setSimulation(null); }} className="h-16 shrink-0 rounded-[10px] border px-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]" style={{ color: LEGACY_COLORS.yellow, background: LEGACY_COLORS.warningBg, borderColor: LEGACY_COLORS.yellow }}>전체 초기화</button>}
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 xl:w-auto xl:grid-cols-[7.5rem_7.5rem_7.5rem]">
            <SummaryCard label="출하 대기" value={currentSimulation?.ship_ready ?? variant.ship_ready} color={LEGACY_COLORS.cyan} simulating={simulating} />
            <SummaryCard label="빠른 생산" value={simulatedValue("fast_production")} color={LEGACY_COLORS.blue} simulating={simulating} onLocate={() => locate("fast_production")} canLocate={!!limitingId("fast_production") && findPath(limitingId("fast_production")!) !== null} />
            <SummaryCard label="총생산" value={simulatedValue("total_production")} color={LEGACY_COLORS.purple} simulating={simulating} onLocate={() => locate("total_production")} canLocate={!!limitingId("total_production") && findPath(limitingId("total_production")!) !== null} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setExpandedItemIds(new Set(branchItemIds))}
              disabled={!hasCollapsedItems}
              className="h-16 rounded-[10px] border px-3 text-xs font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
            >
              모두 펼치기
            </button>
            <button
              type="button"
              onClick={() => setExpandedItemIds(new Set())}
              disabled={!hasExpandedItems}
              className="h-16 rounded-[10px] border px-3 text-xs font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
            >
              모두 접기
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-16 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110"
            style={{
              color: LEGACY_COLORS.red,
            }}
            aria-label="닫기"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)` }}><X className="h-4 w-4" /></span>
          </button>
        </div>
      </div>
      <div ref={tableRef} className="flex min-h-0 flex-1 flex-col px-4 py-3 xl:px-6 xl:py-4">
        {tree === false || error ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
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
          </div>
        ) : !currentTree ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="BOM 구성을 불러오는 중…"
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[18px] border px-4 py-8 text-center text-sm"
            style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <Image src="/images/dexray/history-empty.webp" alt="" width={540} height={360} className="h-32 w-auto object-contain" />
            <span>BOM 구성을 불러오는 중…</span>
          </div>
        ) : currentTree.children.length === 0 ? (
          <EmptyState compact illustrated className="min-h-0 flex-1 rounded-[18px] border border-[var(--c-border)] bg-[var(--c-s2)]" title="하위 품목이 없습니다." description="" />
        ) : (
          <ModalBomTree
            highlightedItemId={highlight?.itemId}
            highlightDescription={highlight?.field === "total_production" ? "총생산 수량에는 현재 재고가 포함됩니다." : undefined}
            headerNotice={simulating ? <span className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-normal" style={{ color: LEGACY_COLORS.yellow }}>
              <span className="font-bold" role="status">시뮬레이션 중</span>
              <span>{excludedItemIds.size}개 제외 · 실제 BOM은 변경되지 않습니다.</span>
              {failed && <span role="alert" className="flex flex-wrap items-center justify-center gap-2" style={{ color: LEGACY_COLORS.red }}>
                <span>{currentSimulation ? "최신 계산 갱신 실패" : "시뮬레이션 계산에 실패했습니다."}</span>
                <button type="button" className="min-h-11 rounded-[10px] border px-2 font-bold" style={{ borderColor: LEGACY_COLORS.red }} onClick={() => setAttempt((value) => value + 1)}>계산 다시 시도</button>
              </span>}
            </span> : undefined}
            showStockBreakdown
            tree={currentTree}
            expandedItemIds={expandedItemIds}
            onToggleItem={toggleItem}
            excludedItemIds={excludedItemIds}
            onToggleExcluded={toggleExcluded}
          />
        )}
      </div>
    </section>
  );
}
