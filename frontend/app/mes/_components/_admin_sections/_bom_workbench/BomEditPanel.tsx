"use client";

import type { BOMEntry, Item } from "@/lib/api";
import { useRef, type ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";
import { BomRow } from "./BomRow";
import { BOM_CURRENT_ROW_GRID_TEMPLATE, BomPanelFrame, BomTableHeader } from "./BomTablePrimitives";
import { AdminReadBoundary, type useAdminReadState } from "../_admin_primitives/AdminReadState";
import { AdminTableSkeleton } from "../_admin_primitives/AdminSkeleton";
import { SkeletonBlock } from "../../common/LoadingSkeleton";
import { AdminDetailViewport } from "../_admin_primitives/AdminDetailViewport";
import { AdminVirtualRows } from "../_admin_primitives/AdminVirtualRows";
import { useAdminScrollRestoration } from "../../_admin_hooks/useAdminSessionState";
import transitions from "../AdminTransitions.module.css";

/**
 * 우측 "현재 BOM 구성" 패널.
 *
 * 본문: 현재 BOM 그리드 (BomRow — 인라인 수량 편집 / 삭제)
 *
 * 부모 헤더(배지+이름+코드+상태+검토버튼)는 패널 상단에 표시한다.
 * 하위품목 추가는 가운데 BomChildAddBox 가 담당(별도 컬럼).
 */
interface Props {
  parent: Item | null;
  bomRows: BOMEntry[];
  items: Item[];
  onSaveQty: (bomId: string, qty: number) => void | Promise<void>;
  onBeginEdit?: () => void;
  onRequestDelete: (row: BOMEntry, childName: string) => void;
  isLocked?: boolean;
  read?: ReturnType<typeof useAdminReadState>;
  parentHeader?: ReactNode;
}

export function BomEditPanel({
  parent,
  bomRows,
  items,
  onSaveQty,
  onBeginEdit,
  onRequestDelete,
  isLocked = false,
  read,
  parentHeader,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useAdminScrollRestoration(`bom.edit.scroll:${parent?.item_id}`, scrollRef, !!parent && !read?.loading && !read?.error);
  if (!parent && !read?.loading && !read?.error) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col rounded-2xl border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <EmptyState
          variant="no-data"
          illustrated
          title="좌측에서 상위 품목을 선택하세요"
          description="부서탭 → 품목 클릭 시 이곳에 현재 BOM 구성이 표시됩니다."
        />
      </div>
    );
  }

  const itemMap = new Map(items.map((i) => [i.item_id, i]));

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${transitions.selection}`}>
      <div
        data-scrollbar-rail-shell
        className="relative flex min-h-0 flex-1 flex-col rounded-2xl"
        style={{ background: LEGACY_COLORS.s1 }}
      >
        <div
          className={parentHeader ? "h-[88px] shrink-0" : "flex h-[88px] shrink-0 items-center px-4 text-sm font-black"}
          style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          {parentHeader ?? <>현재 구성 {read?.loading ? <SkeletonBlock className="ml-2 h-4 w-12" /> : read?.error ? "—" : `(${bomRows.length}건)`}</>}
        </div>
        <AdminDetailViewport selectionKey={`${parent?.item_id}:${read?.loading ? "loading" : read?.error ? "error" : "ready"}`}
          loading={read?.loading} className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            data-scrollbar-rail-viewport
            className="absolute inset-y-0 left-0 right-0 overflow-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]"
          >
            <div className="flex min-h-full min-w-full flex-col" style={{ background: LEGACY_COLORS.s1 }}>
              <BomTableHeader
                variant="current"
                gridTemplateColumns={BOM_CURRENT_ROW_GRID_TEMPLATE}
              />
              <AdminReadBoundary reveal={false} read={read ?? { loading: false, error: undefined, retry: () => {} }} label="현재 구성" skeleton={<AdminTableSkeleton columns={BOM_CURRENT_ROW_GRID_TEMPLATE} count={5} rowClassName="h-[37px]" />}>
              {bomRows.length === 0 ? (
                <EmptyState
                  variant="no-data"
                  illustrated
                  title="등록된 BOM 이 없습니다"
                  description="가운데에서 하위품목을 선택해 추가하세요."
                />
              ) : (
                <AdminVirtualRows items={bomRows} getKey={(row) => row.bom_id} estimateSize={37} scrollRef={scrollRef} renderItem={(r) => (
                  <BomRow
                    key={r.bom_id}
                    row={r}
                    childItem={itemMap.get(r.child_item_id)}
                    onSaveQty={onSaveQty}
                    onBeginEdit={onBeginEdit}
                    onRequestDelete={onRequestDelete}
                    isLocked={isLocked}
                  />
                )} />
              )}
              </AdminReadBoundary>
            </div>
          </div>
        </AdminDetailViewport>
        <BomPanelFrame />
      </div>
    </div>
  );
}
