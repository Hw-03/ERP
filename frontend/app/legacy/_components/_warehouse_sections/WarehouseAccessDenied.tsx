"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * Round-13 (#1) 추출 — DesktopWarehouseView 의 권한 차단 카드.
 *
 * AS / 연구 / 영업 / 기타 부서 등 입출고 권한이 없는 직원이 진입했을 때 표시.
 */
export function WarehouseAccessDenied({ department }: { department: string }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
      <div
        className="max-w-md rounded-[16px] border p-8 text-center"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      >
        <div className="mb-2 text-lg font-black">입출고 권한이 없습니다</div>
        <div className="text-sm" style={{ color: LEGACY_COLORS.muted }}>
          {department} 부서는 입출고 작업을 사용할 수 없습니다.
          <br />
          재고 조회 또는 관리자 탭을 이용해 주세요.
        </div>
      </div>
    </div>
  );
}
