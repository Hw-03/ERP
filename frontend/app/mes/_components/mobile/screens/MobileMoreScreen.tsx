"use client";

import clsx from "clsx";
import { BarChart2, MapPinned, UserRound } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";
import { MoreMenuRow } from "../primitives";

/**
 * MobileMoreScreen — 하단 탭바 5번째 '더보기' 탭의 전폭 화면.
 *
 * 기존 BottomSheet(MobileMoreSheet)를 대체한다: 주간보고·창고지도는 임시 메뉴가 아니라
 * 별도 업무 화면이므로 데스크톱 사이드바처럼 전폭 탭으로 진입한다(2026-06-17 모바일 흐름 리뷰 §4.10).
 * 계정(PIN 변경·로그아웃)은 입력 상태머신이 있는 기존 MobileUserMenuSheet 를 그대로 연다(중복 구현 금지).
 */
export function MobileMoreScreen({
  onWeekly,
  onWarehouseMap,
  onOpenAccount,
}: {
  onWeekly: () => void;
  onWarehouseMap: () => void;
  onOpenAccount: () => void;
}) {
  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-6 pt-3">
      <Section title="업무">
        <MoreMenuRow
          icon={BarChart2}
          label="주간보고"
          description="생산·재고 주간 흐름"
          onClick={onWeekly}
        />
        <MoreMenuRow
          icon={MapPinned}
          label="창고 지도"
          description="위치별 재고 조회"
          onClick={onWarehouseMap}
        />
      </Section>

      <Section title="계정">
        <MoreMenuRow
          icon={UserRound}
          label="내 계정"
          description="PIN 변경 · 로그아웃"
          onClick={onOpenAccount}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2
        className={clsx(TYPO.caption, "px-1 font-black uppercase tracking-[1px]")}
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
