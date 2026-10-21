"use client";

import type { BOMDetailEntry, Item } from "@/lib/api";
import { useRef, type ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatBomQuantity } from "@/lib/mes/bomFormat";
import { EmptyState } from "../../common/EmptyState";
import { BOM_WHERE_USED_ROW_GRID_TEMPLATE, BomTableHeader, BomTableItemRow } from "./BomTablePrimitives";
import { AdminReadBoundary, type useAdminReadState } from "../_admin_primitives/AdminReadState";
import { AdminTableSkeleton } from "../_admin_primitives/AdminSkeleton";
import { SkeletonBlock } from "../../common/LoadingSkeleton";
import { AdminDetailViewport } from "../_admin_primitives/AdminDetailViewport";
import { AdminVirtualRows } from "../_admin_primitives/AdminVirtualRows";
import { useAdminScrollRestoration } from "../../_admin_hooks/useAdminSessionState";
import transitions from "../AdminTransitions.module.css";

/**
 * 역참조 모드 — 선택된 품목이 어느 부모의 자식으로 등장하는지 1단계 조회.
 *
 * 데이터 소스: 페이지가 부모 변경 시 미리 fetch (where-used).
 */
interface Props {
  selected: Item | null;
  rows: BOMDetailEntry[];
  items: Item[];
  onSelectParent: (parentId: string) => void;
  read?: ReturnType<typeof useAdminReadState>;
  parentHeader?: ReactNode;
}

export function BomWhereUsedPanel({ selected, rows, items, onSelectParent, read, parentHeader }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useAdminScrollRestoration(`bom.usage.scroll:${selected?.item_id}`, scrollRef, !!selected && !read?.loading && !read?.error);
  if (!selected && !read?.loading && !read?.error) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col rounded-2xl border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <EmptyState
          variant="no-data"
          illustrated
          title="좌측에서 품목을 선택하세요"
          description="이 품목이 자식으로 들어가는 BOM을 표시합니다."
        />
      </div>
    );
  }

  const itemMap = new Map(items.map((i) => [i.item_id, i]));

  return (
    <div className={`flex min-h-0 flex-1 flex-col [&_[data-bom-row-code]]:text-center ${transitions.selection}`}>
      {/* 역참조 결과 */}
      <div
        className="flex min-h-0 flex-1 flex-col rounded-2xl border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className={parentHeader ? "h-[88px] shrink-0" : "flex h-[88px] shrink-0 items-center px-4 text-sm font-black"}
          style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          {parentHeader ?? <>사용처 {read?.loading ? <SkeletonBlock className="inline-block h-3 w-12" /> : read?.error ? "—" : `(${rows.length}건)`}</>}
        </div>
        <AdminDetailViewport selectionKey={`${selected?.item_id}:${read?.loading ? "loading" : read?.error ? "error" : "ready"}`}
          loading={read?.loading} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <BomTableHeader variant="usage" gridTemplateColumns={BOM_WHERE_USED_ROW_GRID_TEMPLATE} />
          <AdminReadBoundary reveal={false} read={read ?? { loading: false, error: undefined, retry: () => {} }} label="BOM 사용처" skeleton={<AdminTableSkeleton columns={BOM_WHERE_USED_ROW_GRID_TEMPLATE} count={4} rowClassName="h-[37px]" />}>
          {rows.length === 0 ? (
            <EmptyState
              variant="no-data"
              illustrated
              title="사용처 BOM이 없습니다"
              description="이 품목을 자식으로 사용하는 BOM이 없습니다."
            />
          ) : (
            <AdminVirtualRows items={rows} getKey={(row) => row.bom_id} estimateSize={37} scrollRef={scrollRef} renderItem={(r) => {
              const parent = itemMap.get(r.parent_item_id);
              return (
                <BomTableItemRow
                  key={r.bom_id}
                  item={{
                    item_name: r.parent_item_name,
                    mes_code: r.parent_mes_code,
                    process_type_code: parent?.process_type_code ?? null,
                  }}
                  gridTemplateColumns={BOM_WHERE_USED_ROW_GRID_TEMPLATE}
                  title="이 부모로 이동 (편집 모드)"
                  onClick={() => onSelectParent(r.parent_item_id)}
                  trailing={<div className="text-center text-sm font-semibold tabular-nums" style={{ color: LEGACY_COLORS.text }}>
                    {formatBomQuantity(r.quantity, r.unit)}
                  </div>}
                />
              );
            }} />
          )}
          </AdminReadBoundary>
        </div>
        </AdminDetailViewport>
      </div>
    </div>
  );
}
