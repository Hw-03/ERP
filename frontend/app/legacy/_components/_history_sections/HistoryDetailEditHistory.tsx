"use client";

import { History } from "lucide-react";
import type { TransactionEditLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { parseUtc } from "./historyShared";

/**
 * Round-13 (#3) 추출 — HistoryDetailPanel 의 수정 이력 카드.
 * `editsLoaded && edits.length > 0` 분기는 부모에서 처리하고 본 컴포넌트는 항상 렌더.
 */
export function HistoryDetailEditHistory({ edits }: { edits: TransactionEditLog[] }) {
  return (
    <div
      className="rounded-[24px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
        <History className="h-3.5 w-3.5" />
        수정 이력 ({edits.length})
      </div>
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
    </div>
  );
}
