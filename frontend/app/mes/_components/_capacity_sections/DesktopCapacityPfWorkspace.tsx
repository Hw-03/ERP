"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, GitBranch, X } from "lucide-react";
import type { ProductionCapacityPfVariant } from "@/lib/api/types/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import {
  getBomBranchItemIds,
  ModalBomTree,
  useBomTree,
} from "../_warehouse_v2/BomSubExpander";

type Props = {
  variant: ProductionCapacityPfVariant;
  onBack: () => void;
  onClose: () => void;
};

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="min-w-0 rounded-[14px] border px-3 py-2"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="text-center text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div className="mt-0.5 text-center text-lg font-black tabular-nums" style={{ color }}>
        {formatQty(value)}
      </div>
    </div>
  );
}

/** 선택한 출하 완제품(PF)의 세 수량과 전체 BOM을 전용으로 표시한다. */
export function DesktopCapacityPfWorkspace({ variant, onBack, onClose }: Props) {
  const { tree, error, retry } = useBomTree(variant.pf_item_id, true, "desc");
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => new Set());
  const expandedPfRef = useRef<string | null>(null);
  const currentTree = tree && tree.item_id === variant.pf_item_id ? tree : null;
  const branchItemIds = currentTree ? getBomBranchItemIds(currentTree) : [];
  const hasExpandedItems = branchItemIds.some((itemId) => expandedItemIds.has(itemId));
  const hasCollapsedItems = branchItemIds.some((itemId) => !expandedItemIds.has(itemId));

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

  return (
    <section
      aria-label="선택한 출하 완제품 BOM"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 xl:flex-row xl:items-center xl:gap-4 xl:px-6 xl:py-4" style={{ borderColor: LEGACY_COLORS.border }}>
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
              읽기 전용 · 구성품별 현재 재고
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
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 xl:w-auto xl:grid-cols-[7.5rem_7.5rem_7.5rem]">
            <SummaryCard label="출하 대기" value={variant.ship_ready} color={LEGACY_COLORS.cyan} />
            <SummaryCard label="빠른 생산" value={variant.fast_production} color={LEGACY_COLORS.blue} />
            <SummaryCard label="총생산" value={variant.total_production} color={LEGACY_COLORS.purple} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setExpandedItemIds(new Set(branchItemIds))}
              disabled={!hasCollapsedItems}
              className="h-8 rounded-[10px] border px-3 text-xs font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
            >
              모두 펼치기
            </button>
            <button
              type="button"
              onClick={() => setExpandedItemIds(new Set())}
              disabled={!hasExpandedItems}
              className="h-8 rounded-[10px] border px-3 text-xs font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text, background: LEGACY_COLORS.s2 }}
            >
              모두 접기
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3 xl:px-6 xl:py-4">
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
            className="flex min-h-0 flex-1 items-center justify-center rounded-[18px] border px-4 py-8 text-center text-sm"
            style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            불러오는 중…
          </div>
        ) : currentTree.children.length === 0 ? (
          <div
            className="flex min-h-0 flex-1 items-center justify-center rounded-[18px] border px-4 py-8 text-center text-sm"
            style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            하위 품목이 없습니다.
          </div>
        ) : (
          <ModalBomTree
            tree={currentTree}
            expandedItemIds={expandedItemIds}
            onToggleItem={toggleItem}
          />
        )}
      </div>
    </section>
  );
}
