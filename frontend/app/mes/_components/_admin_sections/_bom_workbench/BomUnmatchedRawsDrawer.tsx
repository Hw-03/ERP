"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, AlertCircle, CheckCircle2 } from "lucide-react";
import type { Item } from "@/lib/api";
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
}

export function BomUnmatchedRawsDrawer({ rawItems, childIdSet }: Props) {
  const [open, setOpen] = useState(false);
  const unmatched = rawItems.filter((i) => !childIdSet.has(i.item_id));
  const isEmpty = unmatched.length === 0;
  const accent = isEmpty ? LEGACY_COLORS.green : LEGACY_COLORS.red;

  return (
    <div
      className="rounded-2xl border"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:brightness-105"
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
            {isEmpty ? "전부 매칭됨" : `${unmatched.length}건`}
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
          style={{ borderTop: `1px solid ${LEGACY_COLORS.border}` }}
        >
          {unmatched.map((i) => (
            <div
              key={i.item_id}
              className="grid items-center gap-3 px-3 py-1.5"
              style={{
                gridTemplateColumns: "auto 1fr auto",
                borderBottom: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
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
