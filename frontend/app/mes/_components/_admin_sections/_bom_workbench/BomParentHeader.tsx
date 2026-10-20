"use client";

import { ClipboardCheck } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";
import { BOM_STATUS_META, deptColor, deptOf } from "./bomDept";
import { SkeletonBlock } from "../../common/LoadingSkeleton";

/**
 * 선택된 BOM 부모(또는 사용처 모드에서 선택된 품목) 헤더 카드.
 *
 * 편집·사용처 모드에서 선택 품목 정보를 결과 패널 상단에 표시한다.
 *
 * mode="edit"      → 구성 건수 + [검토 · 완료] 버튼 (독립 카드에만 상태 칩)
 * mode="whereused" → N개 부모에서 사용
 */
interface Props {
  parent: Item | null;
  mode: "edit" | "whereused";
  childCount: number;
  isCompleted: boolean;
  onOpenReview: () => void;
  loading?: boolean;
  unavailable?: boolean;
  embedded?: boolean;
}

export function BomParentHeader({
  parent,
  mode,
  childCount,
  isCompleted,
  onOpenReview,
  loading = false,
  unavailable = false,
  embedded = false,
}: Props) {
  const reviewButton = (
    <button
      type="button"
      onClick={onOpenReview}
      disabled={loading || unavailable || (childCount === 0 && !isCompleted)}
      className="standard-hover inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
  );

  if (!parent) return loading ? <div aria-hidden="true"
    className={embedded ? "flex h-[88px] min-w-0 items-center gap-3 px-4 py-2" : "flex min-h-[58px] min-w-0 flex-1 items-center gap-3 rounded-2xl border px-4 py-2"}
    style={{ background: embedded ? undefined : LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
    <SkeletonBlock className="h-6 w-10 shrink-0" /><div className="flex min-w-0 flex-1 flex-col gap-2"><SkeletonBlock className="h-4 w-2/3" /><SkeletonBlock className="h-3 w-1/2" /></div>{mode === "edit" && reviewButton}
  </div> : null;

  const statusMeta = isCompleted
    ? BOM_STATUS_META.done
    : childCount > 0
      ? BOM_STATUS_META.wip
      : BOM_STATUS_META.todo;

  const subtitleSuffix =
    embedded ? `${mode === "edit" ? "현재 구성" : "사용처"} (${childCount}건)` : mode === "edit" ? `${childCount}개 자식` : `${childCount}개 부모에서 사용`;

  // 카드 자체 강조 — process_type 색으로 살짝 틴트 + 보더 강조.
  // BomBadge 와 같은 색 계열로 톤 일치 (조립/출하/고압 등 부서마다 다름).
  const letter = deptOf(parent.process_type_code);
  const accent = letter ? deptColor(letter) : LEGACY_COLORS.blue;

  return (
    <div
      className={embedded ? "flex h-[88px] min-w-0 items-center gap-3 px-4 py-2" : "flex min-w-0 flex-1 items-center gap-3 rounded-2xl border px-4 py-2"}
      style={{
        minWidth: embedded ? undefined : "min(100%, 420px)",
        background: embedded ? undefined : LEGACY_COLORS.s2,
        borderColor: `color-mix(in srgb, ${accent} 35%, ${LEGACY_COLORS.border})`,
      }}
    >
      <span className="flex w-10 shrink-0 justify-center"><BomBadge processTypeCode={parent.process_type_code} /></span>
      <div className="min-w-0 flex-1">
        <TruncatedText className="truncate text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
          {parent.item_name}
        </TruncatedText>
        <TruncatedText className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {parent.mes_code ?? "(코드 없음)"} · {loading ? <SkeletonBlock className="inline-block h-3 w-20" /> : unavailable ? "—" : subtitleSuffix}
        </TruncatedText>
      </div>
      {mode === "edit" && (
        <div className={embedded ? "shrink-0" : "contents"}>
          {!embedded && <span
            className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-bold"
            style={{
              background: `color-mix(in srgb, ${statusMeta.color} 14%, transparent)`,
              color: statusMeta.color,
            }}
          >
            {loading ? <SkeletonBlock className="h-3 w-8" /> : unavailable ? "—" : statusMeta.label}
          </span>}
          {reviewButton}
        </div>
      )}
    </div>
  );
}
