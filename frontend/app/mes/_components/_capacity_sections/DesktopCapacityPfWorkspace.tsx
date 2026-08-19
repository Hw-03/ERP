"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  ProductionCapacityAfBlock,
  ProductionCapacityPfVariant,
} from "@/lib/api/types/production";
import { getInitialPfVariant, groupPfVariantsByModel } from "@/lib/mes/capacity";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import {
  getBomBranchItemIds,
  ModalBomTree,
  useBomTree,
} from "../_warehouse_v2/BomSubExpander";

type Props = {
  af: ProductionCapacityAfBlock;
};

function findGroupKey(
  groups: ReturnType<typeof groupPfVariantsByModel>,
  pfItemId: string | null,
): string | null {
  if (!pfItemId) return null;
  return groups.find((group) =>
    group.variants.some((variant) => variant.pf_item_id === pfItemId),
  )?.key ?? null;
}

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
      <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div className="mt-0.5 text-lg font-black tabular-nums" style={{ color }}>
        {formatQty(value)}
      </div>
    </div>
  );
}

function SelectedPfBom({ variant }: { variant: ProductionCapacityPfVariant }) {
  const { tree, error, retry } = useBomTree(variant.pf_item_id, true, "desc");
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => new Set());
  const expandedPfRef = useRef<string | null>(null);
  const currentTree = tree && tree.item_id === variant.pf_item_id ? tree : null;

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

  if (tree === false || error) {
    return (
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
    );
  }

  if (!currentTree) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center rounded-[18px] border px-4 py-8 text-center text-sm"
        style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        불러오는 중…
      </div>
    );
  }

  if (currentTree.children.length === 0) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center rounded-[18px] border px-4 py-8 text-center text-sm"
        style={{ color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        하위 품목이 없습니다.
      </div>
    );
  }

  return (
    <ModalBomTree
      tree={currentTree}
      expandedItemIds={expandedItemIds}
      onToggleItem={toggleItem}
    />
  );
}

/** 데스크톱 생산 가능수량을 PF 선택과 읽기 전용 전체 BOM으로 연결한다. */
export function DesktopCapacityPfWorkspace({ af }: Props) {
  const groups = useMemo(() => groupPfVariantsByModel(af), [af]);
  const initialVariant = useMemo(() => getInitialPfVariant(groups), [groups]);
  const variantsById = useMemo(() => {
    const variants = new Map<string, ProductionCapacityPfVariant>();
    groups.forEach((group) => {
      group.variants.forEach((variant) => variants.set(variant.pf_item_id, variant));
    });
    return variants;
  }, [groups]);
  const [selectedPfItemId, setSelectedPfItemId] = useState<string | null>(
    () => initialVariant?.pf_item_id ?? null,
  );
  const selectedVariant = (selectedPfItemId ? variantsById.get(selectedPfItemId) : null)
    ?? initialVariant;
  const selectedGroupKey = findGroupKey(groups, selectedVariant?.pf_item_id ?? null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(selectedGroupKey ? [selectedGroupKey] : []),
  );

  useEffect(() => {
    const nextPfItemId = selectedVariant?.pf_item_id ?? null;
    if (selectedPfItemId !== nextPfItemId) setSelectedPfItemId(nextPfItemId);
  }, [selectedPfItemId, selectedVariant?.pf_item_id]);

  useEffect(() => {
    if (!selectedGroupKey) return;
    setExpandedGroups((current) => {
      if (current.has(selectedGroupKey)) return current;
      const next = new Set(current);
      next.add(selectedGroupKey);
      return next;
    });
  }, [selectedGroupKey]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const selectVariant = (groupKey: string, variant: ProductionCapacityPfVariant) => {
    setSelectedPfItemId(variant.pf_item_id);
    setExpandedGroups((current) => {
      if (current.has(groupKey)) return current;
      const next = new Set(current);
      next.add(groupKey);
      return next;
    });
  };

  if (!selectedVariant) {
    return (
      <section
        aria-label="PF별 생산 가능수량 및 BOM"
        className="hidden min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[18px] border sm:flex"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        선택 가능한 출하 완제품(PF)이 없습니다
      </section>
    );
  }

  return (
    <section
      aria-label="PF별 생산 가능수량 및 BOM"
      className="hidden min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(140px,0.36fr)_minmax(0,1fr)] gap-4 overflow-hidden sm:grid lg:grid-cols-[minmax(260px,0.32fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <section
        aria-label="출하 완제품 선택"
        className="min-h-0 min-w-0 overflow-y-auto rounded-[18px] border p-2"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="px-3 pb-2 pt-1 text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
          출하 완제품(PF)
        </div>
        <div className="space-y-2">
          {groups.map((group) => {
            const expanded = expandedGroups.has(group.key);
            return (
              <div
                key={group.key}
                className="overflow-hidden rounded-[14px] border"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={expanded}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] focus-visible:outline-offset-[-2px]"
                  style={{ color: LEGACY_COLORS.blue }}
                >
                  {expanded
                    ? <ChevronDown className="h-4 w-4 shrink-0" />
                    : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-black">{group.label}</span>
                  <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                    {group.variants.length}종
                  </span>
                </button>
                {expanded && (
                  <div className="space-y-1 border-t p-1.5" style={{ borderColor: LEGACY_COLORS.border }}>
                    {group.variants.map((variant) => {
                      const selected = variant.pf_item_id === selectedVariant.pf_item_id;
                      return (
                        <button
                          key={variant.pf_item_id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => selectVariant(group.key, variant)}
                          className="flex min-h-11 w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
                          style={{
                            background: selected ? tint(LEGACY_COLORS.blue, 10) : LEGACY_COLORS.s1,
                            borderColor: selected ? LEGACY_COLORS.blue : "transparent",
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-bold leading-snug" style={{ color: LEGACY_COLORS.text }}>
                              {variant.pf_name || variant.pf_code}
                            </span>
                            <span className="mt-0.5 block font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                              {variant.pf_code || "-"}
                            </span>
                          </span>
                          {variant.bom_status === "incomplete" && (
                            <span
                              className="shrink-0 rounded-full px-2 py-1 text-xs font-bold"
                              style={{ color: LEGACY_COLORS.yellow, background: tint(LEGACY_COLORS.yellow, 14) }}
                            >
                              BOM 미등록
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section
        aria-label="선택한 출하 완제품 BOM"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[18px] border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b p-4 xl:flex-row xl:items-start xl:gap-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="min-w-0 flex-1 pt-1">
            <div className="break-words text-base font-black leading-snug" style={{ color: LEGACY_COLORS.text }}>
              {selectedVariant.pf_name || selectedVariant.pf_code}
            </div>
            <div className="mt-1 font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {selectedVariant.pf_code || "-"}
            </div>
          </div>
          <div className="grid w-full shrink-0 grid-cols-3 gap-2 xl:w-auto xl:grid-cols-[7.5rem_7.5rem_7.5rem]">
            <SummaryCard label="출하 대기" value={selectedVariant.ship_ready} color={LEGACY_COLORS.cyan} />
            <SummaryCard label="빠른 생산" value={selectedVariant.fast_production} color={LEGACY_COLORS.blue} />
            <SummaryCard label="총생산" value={selectedVariant.total_production} color={LEGACY_COLORS.purple} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <SelectedPfBom key={selectedVariant.pf_item_id} variant={selectedVariant} />
        </div>
      </section>
    </section>
  );
}
