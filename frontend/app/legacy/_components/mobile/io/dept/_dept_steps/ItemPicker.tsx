"use client";

import { PackageSearch, Trash2 } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TYPO } from "../../../tokens";
import { EmptyState } from "../../../primitives";
import { useDeptWizard } from "../context";

/**
 * Round-13 (#2) 추출 — DeptWizard ItemsStep 의 품목 선택 picker.
 *
 * 품목 200개까지 표시 + 선택 시 -10/-1/+1/+10/제거 mini stepper 노출.
 */
export function ItemPicker({ items, loading }: { items: Item[]; loading: boolean }) {
  const { state, dispatch } = useDeptWizard();
  if (loading) {
    return (
      <div className={`${TYPO.body} py-6 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        불러오는 중…
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={PackageSearch} title="품목이 없습니다" description="검색어나 분류를 조정해 보세요." />;
  }
  return (
    <div
      className="overflow-hidden rounded-[14px] border"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {items.slice(0, 200).map((item, idx) => {
        const selected = state.items.has(item.item_id);
        const qty = state.items.get(item.item_id) ?? 0;
        return (
          <div
            key={item.item_id}
            style={{
              borderBottom:
                idx === Math.min(items.length, 200) - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
              borderLeft: selected ? `3px solid ${LEGACY_COLORS.blue}` : "3px solid transparent",
              background: selected ? `${LEGACY_COLORS.blue as string}0d` : "transparent",
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (selected) dispatch({ type: "REMOVE_ITEM", itemId: item.item_id });
                else dispatch({ type: "SET_QTY", itemId: item.item_id, qty: 1 });
              }}
              className="flex w-full items-center gap-3 px-3 py-3 text-left"
            >
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                style={{
                  background: selected ? LEGACY_COLORS.blue : "transparent",
                  borderColor: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                }}
              >
                {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.body} truncate font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {item.item_name}
                </div>
                <div className={`${TYPO.caption} truncate`} style={{ color: LEGACY_COLORS.muted }}>
                  {item.erp_code ?? "-"}
                </div>
              </div>
              <div
                className={`${TYPO.caption} shrink-0 tabular-nums`}
                style={{ color: LEGACY_COLORS.cyan }}
              >
                {formatQty(item.quantity)} {item.unit}
              </div>
            </button>
            {selected ? (
              <div className="flex items-center gap-2 px-3 pb-3">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: Math.max(1, qty - 10) })}
                  className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
                  style={{ background: `${LEGACY_COLORS.red as string}22`, color: LEGACY_COLORS.red }}
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: Math.max(1, qty - 1) })}
                  className={`${TYPO.body} h-8 w-8 rounded-[10px] font-bold`}
                  style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
                >
                  −
                </button>
                <div
                  className={`${TYPO.body} min-w-[54px] rounded-[10px] px-2 py-1 text-center font-black tabular-nums`}
                  style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}
                >
                  {qty}
                </div>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: qty + 1 })}
                  className={`${TYPO.body} h-8 w-8 rounded-[10px] font-bold`}
                  style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.text }}
                >
                  ＋
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_QTY", itemId: item.item_id, qty: qty + 10 })}
                  className={`${TYPO.caption} rounded-[10px] px-2 py-1 font-bold`}
                  style={{ background: `${LEGACY_COLORS.green as string}22`, color: LEGACY_COLORS.green }}
                >
                  +10
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "REMOVE_ITEM", itemId: item.item_id })}
                  className={`${TYPO.caption} ml-auto flex items-center gap-1 rounded-[10px] px-2 py-1 font-semibold`}
                  style={{ color: LEGACY_COLORS.red }}
                >
                  <Trash2 size={12} /> 제거
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
