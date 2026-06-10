"use client";

import { BarChart2, MapPinned, Settings2 } from "lucide-react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { SheetHeader, MoreMenuRow } from "./primitives";

/**
 * MobileMoreSheet — 헤더 ⋮ 버튼이 여는 기능 네비 시트.
 * 하단 탭바에서 강등된 화면(주간보고·창고지도·관리)으로의 진입점.
 * 프로필/PIN/로그아웃을 다루는 MobileUserMenuSheet 와는 의도적으로 분리(통합 금지).
 *
 * MobileTabId 에 직접 의존하지 않도록 진입 동작을 콜백으로 받는다.
 * `onWarehouseMap` 미전달 시 창고지도 행은 "준비 중" 비활성(Phase 5 에서 주입).
 */
export function MobileMoreSheet({
  open,
  onClose,
  onWeekly,
  onAdmin,
  onWarehouseMap,
}: {
  open: boolean;
  onClose: () => void;
  onWeekly: () => void;
  onAdmin: () => void;
  onWarehouseMap?: () => void;
}) {
  function pick(fn: () => void) {
    fn();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="더보기 메뉴">
      <SheetHeader title="더보기" onClose={onClose} />
      <div className="flex flex-col gap-2 px-5 pb-2">
        <MoreMenuRow
          icon={BarChart2}
          label="주간보고"
          description="생산·재고 주간 흐름"
          onClick={() => pick(onWeekly)}
        />
        <MoreMenuRow
          icon={MapPinned}
          label="창고 지도"
          description={onWarehouseMap ? "위치별 재고 조회" : "준비 중"}
          disabled={!onWarehouseMap}
          onClick={() => {
            if (onWarehouseMap) pick(onWarehouseMap);
          }}
        />
        <MoreMenuRow
          icon={Settings2}
          label="관리"
          description="기준정보·운영 설정"
          onClick={() => pick(onAdmin)}
        />
      </div>
    </BottomSheet>
  );
}
