"use client";

import { CheckSquare, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../../tokens";

/**
 * mobile InventoryScreen 다중선택 모드 진입 시 상단에 표시되는 배너.
 *
 * Round-10B (#3) 추출. 선택 모드 토글 시 검색/KPI 영역과 swap 되는 50줄짜리
 * sticky 영역을 sub-component 로 분리. JSX/className/style 모두 보존.
 */
interface Props {
  selectedCount: number;
  onCancel: () => void;
}

export function InventorySelectionBanner({ selectedCount, onCancel }: Props) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3"
      style={{
        background: `${LEGACY_COLORS.blue as string}14`,
        borderBottom: `1px solid ${LEGACY_COLORS.blue as string}44`,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full"
          style={{ background: LEGACY_COLORS.blue }}
        >
          <CheckSquare size={13} strokeWidth={2.5} color={LEGACY_COLORS.white} />
        </span>
        <div className="min-w-0">
          <div
            className={`${TYPO.overline} font-bold uppercase tracking-[2px]`}
            style={{ color: LEGACY_COLORS.blue }}
          >
            선택 모드
          </div>
          <div
            className={`${TYPO.body} font-black tabular-nums`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {selectedCount}개 선택됨
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className={`${TYPO.caption} flex items-center gap-1 rounded-full border px-3 py-[6px] font-semibold active:scale-95`}
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      >
        <X size={13} /> 취소
      </button>
    </div>
  );
}
