"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { bomCategoryColor } from "../adminShared";

/**
 * Round-13 (#11) 추출 — BomComposeTab 의 단일 BOM row.
 *
 * row 의 소요량 inline 편집 모드도 본 컴포넌트에서 처리.
 */
export interface BomComposeRowProps {
  row: BOMEntry;
  childItem: Item | undefined;
  isEditing: boolean;
  isLast: boolean;
  editingQty: string;
  setEditingQty: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}

export function BomComposeRow({
  row,
  childItem,
  isEditing,
  isLast,
  editingQty,
  setEditingQty,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: BomComposeRowProps) {
  const stock = Number(childItem?.quantity ?? 0);
  const capacity = row.quantity > 0 ? Math.floor(stock / Number(row.quantity)) : 0;
  const catColor = bomCategoryColor(childItem?.process_type_code);

  return (
    <div
      className="grid items-center px-5 py-3"
      style={{
        gridTemplateColumns: "36px 1fr 120px 160px 80px 80px 40px",
        borderBottom: isLast ? "none" : `1px solid ${LEGACY_COLORS.border}`,
      }}
    >
      <span
        className="rounded px-1 py-0.5 text-xs font-bold w-fit"
        style={{
          background: `color-mix(in srgb, ${catColor} 12%, transparent)`,
          color: catColor,
        }}
      >
        {childItem?.process_type_code ?? "-"}
      </span>
      <div>
        <div className="truncate text-sm font-medium" style={{ color: LEGACY_COLORS.text }}>
          {childItem?.item_name || row.child_item_id}
        </div>
      </div>
      <div className="text-right text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        {childItem?.erp_code ?? "-"}
      </div>
      <div className="flex items-center justify-end gap-1">
        {isEditing ? (
          <>
            <input
              autoFocus
              type="number"
              value={editingQty}
              onChange={(e) => setEditingQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onCancelEdit(); }}
              className="w-14 rounded border bg-transparent px-1 text-right text-sm outline-none"
              style={{ borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
            />
            <button
              onClick={onSaveEdit}
              className="rounded-[8px] px-2 py-0.5 text-xs font-bold text-white"
              style={{ background: LEGACY_COLORS.blue }}
            >
              변경 저장
            </button>
            <button
              onClick={onCancelEdit}
              className="rounded-[8px] px-1.5 py-0.5 text-xs"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              취소
            </button>
          </>
        ) : (
          <>
            <span className="text-sm" style={{ color: LEGACY_COLORS.text }}>
              ×{formatQty(row.quantity)}
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
            <button
              title="소요량 수정"
              onClick={onStartEdit}
              className="ml-1 flex items-center justify-center rounded-full p-1 hover:bg-[var(--c-s3)]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
      <div
        className="text-right text-sm"
        style={{ color: stock > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.red }}
      >
        {formatQty(stock)}
      </div>
      <div
        className="text-right text-sm font-bold"
        style={{ color: capacity > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}
      >
        {formatQty(capacity)}
      </div>
      <div className="flex justify-end">
        <button
          onClick={onDelete}
          className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
          style={{ color: LEGACY_COLORS.red }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
