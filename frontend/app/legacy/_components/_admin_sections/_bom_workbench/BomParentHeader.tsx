"use client";

import { ClipboardCheck } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";
import { BOM_STATUS_META } from "./bomDept";

/**
 * 선택된 BOM 부모(또는 사용처 모드에서 선택된 품목) 헤더 카드.
 *
 * 원래는 BomEditPanel / BomWhereUsedPanel 내부 상단에 있던 헤더를 BomDeptTabs 옆으로 hoist
 * — 우측 패널은 그리드만 보유, 헤더는 부서 탭과 같은 줄에서 가로로 길게 배치된다.
 *
 * mode="edit"      → 자식 N개 + 상태 칩 + [검토 · 완료] 버튼
 * mode="whereused" → N개 부모에서 사용
 */
interface Props {
  parent: Item | null;
  mode: "edit" | "whereused";
  childCount: number;
  isCompleted: boolean;
  onOpenReview: () => void;
}

export function BomParentHeader({
  parent,
  mode,
  childCount,
  isCompleted,
  onOpenReview,
}: Props) {
  if (!parent) return null;

  const statusMeta = isCompleted
    ? BOM_STATUS_META.done
    : childCount > 0
      ? BOM_STATUS_META.wip
      : BOM_STATUS_META.todo;

  const subtitleSuffix =
    mode === "edit" ? `${childCount}개 자식` : `${childCount}개 부모에서 사용`;

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border px-4 py-2"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <BomBadge processTypeCode={parent.process_type_code} />
      <div className="min-w-0 flex-1">
        <TruncatedText className="truncate text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
          {parent.item_name}
        </TruncatedText>
        <TruncatedText className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {parent.item_code ?? "(코드 없음)"} · {subtitleSuffix}
        </TruncatedText>
      </div>
      {mode === "edit" && (
        <>
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
            disabled={childCount === 0 && !isCompleted}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.green} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 40%, transparent)`,
              color: LEGACY_COLORS.green,
            }}
            title={
              childCount === 0 && !isCompleted
                ? "BOM 구성이 1건 이상일 때 완료 처리 가능합니다."
                : "검토 후 완료 처리"
            }
          >
            <ClipboardCheck size={14} /> 검토 · 완료
          </button>
        </>
      )}
    </div>
  );
}
