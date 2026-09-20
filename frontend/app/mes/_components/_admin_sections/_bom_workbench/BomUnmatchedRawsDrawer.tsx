"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, AlertCircle, CheckCircle2 } from "lucide-react";
import type { BomUnmatchedStatus, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";

/**
 * 미배치 원자재 패널 — 부서 R 단계 중 어느 BOM 의 자식도 아닌 항목.
 *
 * 화면 하단 접이식. 빨간 카운트(미배치 있음) / 초록 ✓(완료) 으로 상태 표시.
 * 클릭하면 펼쳐서 항목 리스트.
 */
interface Props {
  rawItems: Item[]; // 부서 R 단계 전체
  childIdSet: Set<string>; // 자식으로 등록된 모든 item_id
  busyItemIds?: ReadonlySet<string>;
  onStatusChange?: (itemId: string, status: BomUnmatchedStatus | null) => void;
}

const UNMATCHED_STATUS_OPTIONS: { value: BomUnmatchedStatus; label: string; color: string }[] = [
  { value: "DISUSED", label: "불용", color: LEGACY_COLORS.red },
  { value: "HOLD", label: "보류", color: LEGACY_COLORS.yellow },
  { value: "DUPLICATE", label: "중복", color: LEGACY_COLORS.purple },
];

export function BomUnmatchedRawsDrawer({
  rawItems,
  childIdSet,
  busyItemIds = new Set(),
  onStatusChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const unmatched = rawItems.filter((i) => !childIdSet.has(i.item_id));
  const isEmpty = unmatched.length === 0;
  const unprocessedCount = unmatched.filter((i) => !i.bom_unmatched_status).length;
  const isHandled = !isEmpty && unprocessedCount === 0;
  const accent = isEmpty || isHandled ? LEGACY_COLORS.green : LEGACY_COLORS.red;

  return (
    <div
      className="rounded-2xl"
      style={{ background: LEGACY_COLORS.bg }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="no-btn-inset flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:brightness-105"
      >
        <div className="flex items-center gap-2">
          {isEmpty ? (
            <CheckCircle2 size={16} style={{ color: accent }} />
          ) : (
            <AlertCircle size={16} style={{ color: accent }} />
          )}
          <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
            미배치 원자재
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[12px] font-bold"
            style={{
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
            }}
          >
            {isEmpty ? "전부 매칭됨" : isHandled ? "처리 완료" : `${unprocessedCount}건`}
          </span>
        </div>
        {open ? (
          <ChevronDown size={16} style={{ color: LEGACY_COLORS.muted2 }} />
        ) : (
          <ChevronUp size={16} style={{ color: LEGACY_COLORS.muted2 }} />
        )}
      </button>
      {open && !isEmpty && (
        <div
          className="max-h-[30vh] overflow-y-auto"
          style={{ background: LEGACY_COLORS.bg, borderTop: `1px solid ${LEGACY_COLORS.border}` }}
        >
          {unmatched.map((i) => (
            <div
              key={i.item_id}
              className="grid items-center gap-2 px-3 py-1.5"
              style={{
                gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              <div className="flex items-center gap-0.5">
                {UNMATCHED_STATUS_OPTIONS.map((option) => {
                  const isSelected = i.bom_unmatched_status === option.value;
                  const isBusy = busyItemIds.has(i.item_id);
                  const itemIdentifier = i.mes_code ?? i.item_id;
                  return (
                    <label
                      key={option.value}
                      className="flex h-11 min-w-11 cursor-pointer items-center gap-1 px-1 text-xs font-bold transition-opacity has-[:disabled]:cursor-wait has-[:disabled]:opacity-50"
                      style={{ color: isSelected ? option.color : LEGACY_COLORS.muted2 }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isBusy}
                        aria-label={`${i.item_name} (${itemIdentifier}) ${option.label}`}
                        onChange={() => onStatusChange?.(
                          i.item_id,
                          isSelected ? null : option.value,
                        )}
                        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait"
                        style={{ accentColor: option.color, borderColor: LEGACY_COLORS.borderStrong }}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
              <BomBadge processTypeCode={i.process_type_code} small />
              <div className="min-w-0">
                <TruncatedText className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>
                  {i.item_name}
                </TruncatedText>
              </div>
              <div className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {i.mes_code}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
