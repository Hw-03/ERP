"use client";

import type { TransactionEditLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { parseUtc } from "./historyFormat";

/**
 * Round-13 (#3) 추출 — HistoryDetailPanel 의 수정 이력 본문.
 * Phase4 (#F4): 외부 카드 wrapper 제거 — 부모 Collapsible 이 카드와 헤더 담당.
 */
export function HistoryDetailEditHistory({ edits }: { edits: TransactionEditLog[] }) {
  return (
    <div className="space-y-2">
      {edits.map((e) => (
        <div
          key={e.edit_id}
          className="rounded-[12px] border p-3 text-sm"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
              {e.edited_by_name}
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {parseUtc(e.created_at).toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            사유: <span style={{ color: LEGACY_COLORS.text }}>{e.reason}</span>
          </div>
          {e.correction_log_id && (
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.yellow }}>
              수량 보정 거래 생성됨
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
