"use client";

import type { BOMDetailEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatBomQuantity } from "@/lib/mes/bomFormat";
import { TruncatedText } from "@/lib/ui";
import { EmptyState } from "../../common/EmptyState";
import { BomBadge } from "./BomBadge";
import { AdminReadBoundary, type useAdminReadState } from "../_admin_primitives/AdminReadState";
import { AdminTableSkeleton } from "../_admin_primitives/AdminSkeleton";
import { SkeletonBlock } from "../../common/LoadingSkeleton";

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
}

export function BomWhereUsedPanel({ selected, rows, items, onSelectParent, read }: Props) {
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 부모/품목 헤더는 BomDeptTabs 옆 행으로 hoist 되어 BomParentHeader 가 담당. */}
      {/* 역참조 결과 */}
      <div
        className="flex min-h-0 flex-1 flex-col rounded-2xl border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest"
          style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          <>사용처 {read?.loading ? <SkeletonBlock className="inline-block h-3 w-12" /> : read?.error ? "—" : `(${rows.length}건)`}</>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AdminReadBoundary read={read ?? { loading: false, error: undefined, retry: () => {} }} label="BOM 사용처" skeleton={<AdminTableSkeleton columns="auto 1fr 120px" count={5} rowClassName="h-[37px]" />}>
          {rows.length === 0 ? (
            <EmptyState
              variant="no-data"
              illustrated
              title="사용처 BOM이 없습니다"
              description="이 품목을 자식으로 사용하는 BOM이 없습니다."
            />
          ) : (
            rows.map((r) => {
              const parent = itemMap.get(r.parent_item_id);
              return (
                <button
                  key={r.bom_id}
                  type="button"
                  onClick={() => onSelectParent(r.parent_item_id)}
                  className="grid w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--c-s4)]"
                  style={{
                    gridTemplateColumns: "auto 1fr 120px",
                    borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  }}
                  title="이 부모로 이동 (편집 모드)"
                >
                  <BomBadge processTypeCode={parent?.process_type_code} />
                  <div className="min-w-0">
                    <TruncatedText className="truncate text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
                      {r.parent_item_name}
                    </TruncatedText>
                    <TruncatedText className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {r.parent_mes_code ?? "(코드 없음)"}
                    </TruncatedText>
                  </div>
                  <div className="text-center text-sm font-semibold tabular-nums" style={{ color: LEGACY_COLORS.text }}>
                    {formatBomQuantity(r.quantity, r.unit)}
                  </div>
                </button>
              );
            })
          )}
          </AdminReadBoundary>
        </div>
      </div>
    </div>
  );
}
