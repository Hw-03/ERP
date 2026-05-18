"use client";

import { ClipboardCheck } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";
import { BomBadge } from "./BomBadge";
import { BomRow } from "./BomRow";
import { BOM_STATUS_META } from "./bomDept";

/**
 * 우측 "현재 BOM 구성" 패널.
 *
 * 상단: 부모 헤더(배지+이름+코드) + 완료 상태 칩 + [검토 · 완료] 버튼
 * 본문: 현재 BOM 그리드 (BomRow — 인라인 수량 편집 / 삭제)
 *
 * 하위품목 추가는 가운데 BomChildAddBox 가 담당(별도 컬럼).
 */
interface Props {
  parent: Item | null;
  bomRows: BOMEntry[];
  items: Item[];
  isCompleted: boolean;
  onSaveQty: (bomId: string, qty: number) => void | Promise<void>;
  onRequestDelete: (row: BOMEntry, childName: string) => void;
  onOpenReview: () => void;
}

export function BomEditPanel({
  parent,
  bomRows,
  items,
  isCompleted,
  onSaveQty,
  onRequestDelete,
  onOpenReview,
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
  const statusMeta = isCompleted ? BOM_STATUS_META.done : bomRows.length > 0 ? BOM_STATUS_META.wip : BOM_STATUS_META.todo;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 부모 헤더 + 완료 상태 + 검토·완료 */}
      <div
        className="flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-3"
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
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{
            background: `color-mix(in srgb, ${statusMeta.color} 14%, transparent)`,
            color: statusMeta.color,
          }}
        >
          {statusMeta.label}
        </span>
        <button
          type="button"
          onClick={onOpenReview}
          disabled={bomRows.length === 0 && !isCompleted}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.green} 12%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 40%, transparent)`,
            color: LEGACY_COLORS.green,
          }}
          title={
            bomRows.length === 0 && !isCompleted
              ? "BOM 구성이 1건 이상일 때 완료 처리 가능합니다."
              : "검토 후 완료 처리"
          }
        >
          <ClipboardCheck size={14} /> 검토 · 완료
        </button>
      </div>

      {/* 현재 BOM 그리드 */}
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
