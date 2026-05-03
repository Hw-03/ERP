"use client";

// 5.6-E: 선택된 parent 가 다른 BOM 의 child 로 등록된 위치(역참조) 표시.
// AdminBomContext 의존. parent 미선택 또는 결과 0건이면 렌더 안 함.

import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { useAdminBomContext } from "../AdminBomContext";

export function BomWhereUsedPanel() {
  const { parentId, whereUsedRows } = useAdminBomContext();
  if (!parentId || whereUsedRows.length === 0) return null;

  return (
    <div
      className="shrink-0 overflow-hidden rounded-[28px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          이 품목이 사용되는 곳 (Where-Used)
        </div>
        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {whereUsedRows.length}건 — 다른 BOM 에서 child 로 등록된 위치
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {whereUsedRows.map((row) => (
          <div
            key={row.bom_id}
            className="flex items-center justify-between px-4 py-2 text-sm"
            style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" style={{ color: LEGACY_COLORS.text }}>
                {row.parent_item_name}
              </div>
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {row.parent_erp_code}
              </div>
            </div>
            <div className="shrink-0 text-right text-sm" style={{ color: LEGACY_COLORS.text }}>
              ×{formatQty(row.quantity)}
              <span className="ml-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {row.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
