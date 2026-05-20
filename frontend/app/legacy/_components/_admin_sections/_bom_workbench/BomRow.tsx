"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";

/**
 * BOM 그리드 한 행 — 자식 품목 정보 + 수량(인라인 편집) + 삭제.
 *
 * 인라인 수량 편집:
 *   - 수량 칸 클릭 → input 노출 + 자동 select
 *   - Enter / blur 저장 (parseFloat > 0 검증)
 *   - Esc 취소
 *
 * 삭제는 부모에서 ConfirmModal 띄우도록 onRequestDelete 콜백.
 */
interface Props {
  row: BOMEntry;
  childItem: Item | undefined;
  onSaveQty: (bomId: string, qty: number) => void | Promise<void>;
  onRequestDelete: (row: BOMEntry, childName: string) => void;
}

export function BomRow({ row, childItem, onSaveQty, onRequestDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.quantity));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = parseFloat(draft);
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(String(row.quantity));
      return;
    }
    if (next === row.quantity) return;
    void onSaveQty(row.bom_id, next);
  }

  function cancel() {
    setEditing(false);
    setDraft(String(row.quantity));
  }

  const childName = childItem?.item_name ?? "(삭제된 품목)";
  const erpCode = childItem?.erp_code ?? "";
  const unit = row.unit || childItem?.unit || "EA";

  return (
    <div
      className="grid items-center gap-3 px-3 py-2.5 transition-colors hover:brightness-105"
      style={{
        gridTemplateColumns: "auto 1fr 140px 40px",
        borderBottom: `1px solid ${LEGACY_COLORS.border}`,
      }}
    >
      <BomBadge processTypeCode={childItem?.process_type_code} />
      <div className="min-w-0">
        <TruncatedText className="truncate text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
          {childName}
        </TruncatedText>
        {erpCode && (
          <TruncatedText className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {erpCode}
          </TruncatedText>
        )}
      </div>
      <div className="flex justify-end">
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            min="0"
            step="any"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className="w-full rounded-md border px-2 py-1 text-right text-sm font-semibold outline-none"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.blue,
              color: LEGACY_COLORS.text,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border px-3 py-1 text-sm font-semibold transition-colors hover:brightness-110"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
            title="클릭하여 수량 수정"
          >
            ×{formatQty(row.quantity)} {unit}
          </button>
        )}
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => onRequestDelete(row, childName)}
          className="rounded-md p-1.5 transition-colors hover:brightness-110"
          style={{
            color: LEGACY_COLORS.red,
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
          }}
          title="삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
