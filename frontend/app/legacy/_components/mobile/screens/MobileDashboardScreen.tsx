"use client";

import { DesktopInventoryView } from "../../DesktopInventoryView";

/**
 * 대시보드 모바일 화면.
 *
 * Phase A: 데스크탑 뷰 패스스루(기능 보존). Phase B-1 에서 모바일 네이티브
 * 레이아웃(세로 스크롤 + 확장 BottomSheet 상세)으로 내부 교체.
 * 데이터/로직은 데스크탑 훅을 그대로 재사용한다.
 */
export function MobileDashboardScreen(
  props: React.ComponentProps<typeof DesktopInventoryView>,
) {
  return <DesktopInventoryView {...props} />;
}
