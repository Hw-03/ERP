"use client";

import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";
import { BomRow } from "./BomRow";

/**
 * 우측 "현재 BOM 구성" 패널.
 *
 * 본문: 현재 BOM 그리드 (BomRow — 인라인 수량 편집 / 삭제)
 *
 * 부모 헤더(배지+이름+코드+상태+검토버튼)는 BomDeptTabs 옆 행으로 hoist 되어 BomParentHeader 가 담당.
 * 하위품목 추가는 가운데 BomChildAddBox 가 담당(별도 컬럼).
 */
interface Props {
  parent: Item | null;
  bomRows: BOMEntry[];
  items: Item[];
  onSaveQty: (bomId: string, qty: number) => void | Promise<void>;
  onRequestDelete: (row: BOMEntry, childName: string) => void;
}

export function BomEditPanel({
  parent,
  bomRows,
  items,
  onSaveQty,
  onRequestDelete,
}: Props) {
  if (!parent) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <EmptyState
          variant="no-data"
          title="좌측에서 상위 품목을 선택하세요"
          description="부서탭 → 품목 클릭 시 이곳에 현재 BOM 구성이 표시됩니다."
        />
      </div>
    );
  }

  const itemMap = new Map(items.map((i) => [i.item_id, i]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col rounded-2xl border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="shrink-0 px-4 py-2.5 text-xs font-bold uppercase tracking-widest"
          style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          현재 구성 ({bomRows.length}건)
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {bomRows.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              등록된 BOM 이 없습니다. 가운데에서 하위품목을 선택해 추가하세요.
            </div>
          ) : (
            bomRows.map((r) => (
              <BomRow
                key={r.bom_id}
                row={r}
                childItem={itemMap.get(r.child_item_id)}
                onSaveQty={onSaveQty}
                onRequestDelete={onRequestDelete}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
