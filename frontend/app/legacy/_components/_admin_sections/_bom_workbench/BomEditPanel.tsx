"use client";

import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";
import { BomBadge } from "./BomBadge";
import { BomRow } from "./BomRow";
import { BomChildAddBox } from "./BomChildAddBox";

/**
 * 우측 BOM 편집 패널 — 선택된 부모의 직계 자식 목록 + 추가 박스.
 *
 * 상단: 부모 헤더(배지+이름+코드)
 * 중단: BOM 그리드 (BomRow)
 * 하단: BomChildAddBox (검색/필터/후보)
 */
interface Props {
  parent: Item | null;
  bomRows: BOMEntry[];
  items: Item[];
  onSaveQty: (bomId: string, qty: number) => void | Promise<void>;
  onRequestDelete: (row: BOMEntry, childName: string) => void;
  onPickChild: (childId: string, childName: string) => void;
}

export function BomEditPanel({
  parent,
  bomRows,
  items,
  onSaveQty,
  onRequestDelete,
  onPickChild,
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
          description="부서탭 → 품목 클릭 시 이곳에 BOM 편집 화면이 표시됩니다."
        />
      </div>
    );
  }

  const itemMap = new Map(items.map((i) => [i.item_id, i]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 부모 헤더 */}
      <div
        className="flex items-center gap-3 rounded-2xl border px-4 py-3"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <BomBadge processTypeCode={parent.process_type_code} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
            {parent.item_name}
          </div>
          <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {parent.erp_code ?? "(코드 없음)"} · {bomRows.length}개 자식
          </div>
        </div>
      </div>

      {/* 현재 BOM 그리드 */}
      <div
        className="flex flex-col rounded-2xl border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest"
          style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          현재 구성 ({bomRows.length}건)
        </div>
        <div className="max-h-[40vh] overflow-y-auto">
          {bomRows.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              아직 등록된 자식 품목이 없습니다. 아래에서 추가하세요.
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

      {/* 자식 추가 박스 */}
      <BomChildAddBox parent={parent} bomRows={bomRows} items={items} onPick={onPickChild} />
    </div>
  );
}
