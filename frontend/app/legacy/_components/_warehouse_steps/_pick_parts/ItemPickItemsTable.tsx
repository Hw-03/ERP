"use client";

import { Check } from "lucide-react";
import type { Item } from "@/lib/api";
import { EmptyState } from "../../common/EmptyState";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getStockState } from "@/lib/mes/inventory";
import { formatQty } from "@/lib/mes/format";
import { PROCESS_TYPE_LABEL, PAGE_SIZE } from "../_constants";

/**
 * ItemPickStep 내부 품목 테이블 + "100개 더 보기" 버튼.
 *
 * Round-10B (#2) 추출. ItemPickStep.tsx 본문에서 가장 큰 JSX 블록(~110줄)
 * 을 sub-component 로 분리해 부모 파일을 가볍게 한다.
 *
 * 시각/렌더 트리 변경 0 — table + tbody + tr 구조 그대로 유지.
 */

interface Props {
  items: Item[];
  selectedItems: Map<string, number>;
  displayLimit: number;
  setDisplayLimit: React.Dispatch<React.SetStateAction<number>>;
  onToggleItem: (id: string) => void;
  hasActiveFilter: boolean;
  clearFilters: () => void;
}

export function ItemPickItemsTable({
  items,
  selectedItems,
  displayLimit,
  setDisplayLimit,
  onToggleItem,
  hasActiveFilter,
  clearFilters,
}: Props) {
  return (
    <>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s2 }}>
          <tr
            className="text-left text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            <th className="w-10 px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}></th>
            <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>품목명 (품목 코드)</th>
            <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>모델</th>
            <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>분류</th>
            <th className="px-2 py-2 text-center" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>상태</th>
            <th className="px-3 py-2 text-right" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>현재 재고</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, displayLimit).map((item) => {
            const active = selectedItems.has(item.item_id);
            const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
            const categoryLabel = item.process_type_code ? (PROCESS_TYPE_LABEL[item.process_type_code] ?? item.process_type_code) : "-";
            return (
              <tr
                key={item.item_id}
                data-item-id={item.item_id}
                onClick={() => onToggleItem(item.item_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleItem(item.item_id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={active}
                className="cursor-pointer transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
                style={{
                  background: active ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)` : "transparent",
                }}
              >
                <td className="px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-[4px] border"
                    style={{
                      background: active ? LEGACY_COLORS.blue : "transparent",
                      borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                    }}
                  >
                    {active && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                </td>
                <td className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {item.item_name}
                  </span>
                  <span className="ml-1 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                    ({item.erp_code ?? "-"})
                  </span>
                </td>
                <td className="px-2 py-2 text-xs" style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  {item.legacy_model ?? "-"}
                </td>
                <td className="px-2 py-2 text-xs" style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  {categoryLabel}
                </td>
                <td className="px-2 py-2 text-center" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 14%, transparent)` }}
                  >
                    {stock.label}
                  </span>
                </td>
                <td
                  className="px-3 py-2 text-right text-sm font-black tabular-nums"
                  style={{
                    color: Number(item.quantity) > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                >
                  {formatQty(item.quantity)}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-2">
                <EmptyState
                  variant={hasActiveFilter ? "filtered-out" : "no-data"}
                  compact
                  description={
                    hasActiveFilter
                      ? "필터를 해제하면 다시 표시됩니다."
                      : "조회할 품목이 없습니다."
                  }
                  action={
                    hasActiveFilter
                      ? { label: "필터 해제", onClick: clearFilters }
                      : undefined
                  }
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {items.length > displayLimit && (
        <div className="p-2">
          <button
            type="button"
            onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
            className="w-full rounded-[12px] border py-2.5 text-xs font-semibold"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            100개 더 보기 ({formatQty(Math.min(displayLimit + PAGE_SIZE, items.length))} / {formatQty(items.length)})
          </button>
        </div>
      )}
    </>
  );
}
