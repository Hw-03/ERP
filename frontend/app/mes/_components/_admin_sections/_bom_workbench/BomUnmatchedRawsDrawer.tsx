"use client";

import { useId, useState, type ReactElement } from "react";
import { ChevronUp, ChevronDown, Boxes, CheckCircle2 } from "lucide-react";
import type { BomUnmatchedStatus, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";
import transitions from "../AdminTransitions.module.css";
import { SkeletonBlock } from "../../common/LoadingSkeleton";

/** 접힌 요약 행의 높이를 데이터 조회·오류 중에도 예약한다. */
export function BomUnmatchedRawsSkeleton(): ReactElement {
  return <div aria-hidden="true" className="mt-3 shrink-0 overflow-hidden rounded-2xl border"
    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 12%, transparent)`, color: LEGACY_COLORS.yellow }}><Boxes size={18} /></span>
        <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>미배치 원자재</span>
        <SkeletonBlock className="h-4 w-12" />
        <span className="hidden truncate text-xs xl:block" style={{ color: LEGACY_COLORS.muted2 }}>BOM에 연결되지 않은 품목</span>
      </div>
      <SkeletonBlock className="h-4 w-12" />
    </div>
  </div>;
}

/**
 * 미배치 원자재 패널 — 부서 R 단계 중 어느 BOM 의 자식도 아닌 항목.
 *
 * 화면 하단 접이식 카드. 펼치면 품목 정보와 처리 상태를 카드 단위로 표시한다.
 */
interface Props {
  rawItems: Item[]; // 부서 R 단계 전체
  childIdSet: Set<string>; // 자식으로 등록된 모든 item_id
  busyItemIds?: ReadonlySet<string>;
  onStatusChange?: (itemId: string, status: BomUnmatchedStatus | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const listId = useId();
  const unmatched = rawItems.filter((i) => !childIdSet.has(i.item_id));
  const isEmpty = unmatched.length === 0;
  const unprocessedCount = unmatched.filter((i) => !i.bom_unmatched_status).length;
  const isHandled = !isEmpty && unprocessedCount === 0;
  const accent = isEmpty || isHandled ? LEGACY_COLORS.green : LEGACY_COLORS.yellow;

  return (
    <div
      className={`${open ? "flex min-h-0 flex-1 flex-col" : "mt-3 shrink-0"} overflow-hidden rounded-2xl border`}
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <button
        type="button"
        onClick={() => {
          setLocalOpen(!open);
          onOpenChange?.(!open);
        }}
        aria-expanded={open}
        aria-controls={!isEmpty ? listId : undefined}
        className="no-btn-inset flex min-h-14 w-full shrink-0 items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--c-s2)]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
          {isEmpty ? (
            <CheckCircle2 size={18} />
          ) : (
            <Boxes size={18} />
          )}
          </span>
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
          <span className="hidden truncate text-xs xl:block" style={{ color: LEGACY_COLORS.muted2 }}>
            BOM에 연결되지 않은 품목
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
        {open ? "접기" : "펼치기"}
        {open ? (
          <ChevronDown size={16} style={{ color: LEGACY_COLORS.muted2 }} />
        ) : (
          <ChevronUp size={16} style={{ color: LEGACY_COLORS.muted2 }} />
        )}
        </span>
      </button>
      {open && !isEmpty && (
        <div
          id={listId}
          role="region"
          aria-label="미배치 원자재 목록"
          className={`min-h-0 flex-1 overflow-y-auto p-3 ${transitions.fade}`}
          style={{ background: LEGACY_COLORS.s2, borderTop: `1px solid ${LEGACY_COLORS.border}` }}
        >
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
          {unmatched.map((i) => (
            <div
              key={i.item_id}
              className="flex min-w-0 items-center gap-3 rounded-xl border p-3"
              style={{
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
              }}
            >
              <BomBadge processTypeCode={i.process_type_code} small />
              <div className="min-w-0 flex-1">
                <TruncatedText className="truncate text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
                  {i.item_name}
                </TruncatedText>
                <div className="mt-1 truncate text-xs tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                  {i.mes_code ?? "코드 없음"}
                </div>
              </div>
              <div className="flex shrink-0 items-center rounded-[10px] border p-0.5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                {UNMATCHED_STATUS_OPTIONS.map((option) => {
                  const isSelected = i.bom_unmatched_status === option.value;
                  const isBusy = busyItemIds.has(i.item_id);
                  const itemIdentifier = i.mes_code ?? i.item_id;
                  return (
                    <label
                      key={option.value}
                      className="flex h-11 w-12 cursor-pointer items-center justify-center rounded-lg text-xs font-bold transition-colors focus-within:ring-2 focus-within:ring-[var(--c-blue)] has-[:disabled]:cursor-wait has-[:disabled]:opacity-50"
                      style={{
                        color: isSelected ? option.color : LEGACY_COLORS.muted2,
                        background: isSelected ? `color-mix(in srgb, ${option.color} 14%, transparent)` : undefined,
                      }}
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
                        className="sr-only"
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
