"use client";

import { BarChart2, MapPinned, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

/**
 * MobileMoreScreen — 하단 탭바 5번째 '더보기' 탭의 전폭 화면.
 *
 * 주간보고·창고지도는 임시 메뉴가 아니라 별도 업무 화면이므로 큰 카드형 버튼으로 진입한다.
 * (항목 2-7 — 계정 PIN 변경·로그아웃은 글로벌 헤더 프로필 버튼에 이미 있어 여기선 제외, 중복 제거.)
 * (항목 2-8 — "업무" 섹션 라벨 제거하고 큰 카드 2열 그리드로. 메뉴가 늘어도 그리드로 확장 가능.)
 */
export function MobileMoreScreen({
  onWeekly,
  onWarehouseMap,
}: {
  onWeekly: () => void;
  onWarehouseMap: () => void;
}) {
  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-6 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <BigCard
          icon={BarChart2}
          label="주간보고"
          description="생산·재고 주간 흐름"
          accent={LEGACY_COLORS.blue}
          onClick={onWeekly}
        />
        <BigCard
          icon={MapPinned}
          label="창고 지도"
          description="위치별 재고 조회"
          accent={LEGACY_COLORS.cyan}
          onClick={onWarehouseMap}
        />
      </div>
    </div>
  );
}

function BigCard({
  icon: Icon,
  label,
  description,
  accent,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[150px] flex-col items-start justify-between gap-4 rounded-[20px] border p-5 text-left transition-[transform] active:scale-[0.98]"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-[16px]"
        style={{ background: tint(accent, 16) }}
      >
        <Icon className="h-7 w-7" style={{ color: accent }} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-lg font-black leading-tight">{label}</span>
        <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          {description}
        </span>
      </span>
    </button>
  );
}
