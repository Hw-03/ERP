"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyItemReport } from "@/lib/api/types/weekly";
import { LoadingSkeleton } from "../common/LoadingSkeleton";

type CriticalItem = WeeklyItemReport & { process_code: string; dept_name: string };

interface Props {
  items: CriticalItem[];
  loading: boolean;
}

function getReason(item: CriticalItem): string {
  if (item.in_qty === 0 && item.out_qty > 0) return "출고만 발생";
  if (item.in_qty > 0 && item.out_qty > 0) return "출고 초과";
  return "재고 감소";
}

function WeeklyCriticalItemsImpl({ items, loading }: Props) {
  return (
    <div
      className="shrink-0 rounded-[22px] border p-4"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      {/* 헤더 */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[11px] font-black" style={{ color: LEGACY_COLORS.text }}>
          확인 필요 품목
        </h2>
        {items.length > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-black"
            style={{
              color: LEGACY_COLORS.red,
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, ${LEGACY_COLORS.s2})`,
            }}
          >
            {items.length}건
          </span>
        )}
      </div>

      {loading && <LoadingSkeleton variant="list" rows={3} />}

      {!loading && items.length === 0 && (
        <div
          className="rounded-[14px] border px-4 py-4 text-center"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 28%, ${LEGACY_COLORS.border})`,
            background: `color-mix(in srgb, ${LEGACY_COLORS.green} 5%, ${LEGACY_COLORS.s1})`,
          }}
        >
          <div className="text-[12px] font-black" style={{ color: LEGACY_COLORS.green }}>
            확인 필요한 품목이 없습니다.
          </div>
          <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
            선택 주차 기준 재고 감소 품목이 없습니다.
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="flex max-h-[140px] flex-col gap-0.5 overflow-auto">
          {items.map((item) => (
            <div
              key={item.item_id}
              className="flex items-center gap-3 rounded-[10px] px-2 py-1.5"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.red} 3%, ${LEGACY_COLORS.s1})`,
              }}
            >
              {/* 품목 코드 + 품명 */}
              <div className="min-w-0 flex-1">
                <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                  {item.erp_code ?? "—"}
                </div>
                <div
                  className="truncate text-[12px] font-bold"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {item.item_name}
                </div>
              </div>

              {/* 공정 배지 */}
              <span
                className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black"
                style={{
                  color: LEGACY_COLORS.muted,
                  background: LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                }}
              >
                {item.dept_name}/{item.process_code}
              </span>

              {/* 증감 + 사유 */}
              <div className="shrink-0 text-right">
                <div className="text-[12px] font-black" style={{ color: LEGACY_COLORS.red }}>
                  {formatQty(item.delta)}
                </div>
                <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted }}>
                  {getReason(item)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const WeeklyCriticalItems = memo(WeeklyCriticalItemsImpl);
