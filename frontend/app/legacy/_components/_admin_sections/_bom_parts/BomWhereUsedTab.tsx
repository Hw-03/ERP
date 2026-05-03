"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";
import { useAdminBomContext } from "../AdminBomContext";
import { BomParentPicker } from "./BomParentPicker";
import { BomWhereUsedPanel } from "./BomWhereUsedPanel";

/**
 * AdminBomSection 의 "사용처 조회" 탭.
 *
 * Round-10B (#7) 추출. 좌측 BomParentPicker + 우측 사용처 panel/empty 분기.
 * 데이터(parentId, whereUsedRows) 는 Context 에서 직접 읽는다.
 */
export function BomWhereUsedTab() {
  const { parentId, whereUsedRows } = useAdminBomContext();

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="w-[280px] shrink-0 min-h-0">
        <BomParentPicker />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {!parentId ? (
          <div
            className="flex flex-1 items-center justify-center rounded-[28px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
              좌측에서 품목을 선택하면 사용처를 확인할 수 있습니다
            </div>
          </div>
        ) : whereUsedRows.length === 0 ? (
          <div
            className="flex flex-1 flex-col overflow-hidden rounded-[28px] border"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
              <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                이 품목이 사용되는 곳 (Where-Used)
              </div>
            </div>
            <EmptyState
              variant="no-data"
              compact
              title="사용처가 없습니다."
              description="이 품목은 다른 BOM에서 하위 품목으로 등록되어 있지 않습니다."
            />
          </div>
        ) : (
          <BomWhereUsedPanel />
        )}
      </div>
    </div>
  );
}
