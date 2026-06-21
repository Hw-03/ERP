"use client";

import { BarChart2, MapPinned, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * MobileMoreScreen — 하단 탭바 5번째 '더보기' 탭의 전폭 화면.
 *
 * 주간보고·창고지도는 임시 메뉴가 아니라 별도 업무 화면이므로 큰 카드형 버튼으로 진입한다.
 * (항목 2-7 — 계정 PIN 변경·로그아웃은 글로벌 헤더 프로필 버튼에 이미 있어 여기선 제외.)
 * (항목 3-5 — 불량 허브 첫 화면처럼 세로 1열로 쭉 크게: 카드가 화면 높이를 flex-1 로 균등 분할.)
 */
export function MobileMoreScreen({
  onWeekly,
  onWarehouseMap,
}: {
  onWeekly: () => void;
  onWarehouseMap: () => void;
}) {
  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
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
      className="flex min-h-[96px] flex-1 items-center gap-5 rounded-[18px] border p-4 text-left transition-[transform] active:scale-[0.99]"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
    >
      <span
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px]"
        style={{ background: `color-mix(in srgb, ${accent} 20%, transparent)` }}
      >
        <Icon
          className="h-8 w-8"
          style={{ color: `color-mix(in srgb, ${accent} 42%, ${LEGACY_COLORS.text})` }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-black leading-tight">{label}</span>
        <span className="block text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          {description}
        </span>
      </span>
    </button>
  );
}
