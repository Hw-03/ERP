"use client";

import { DesktopWarehouseView } from "../../DesktopWarehouseView";

/**
 * 입출고 모바일 화면.
 *
 * Phase A: 데스크탑 뷰 패스스루. Phase B-2 에서 풀스크린 스텝 위저드 +
 * 바텀시트 품목 선택 + 썸존 하단 액션으로 내부 교체(로직 재사용).
 */
export function MobileWarehouseScreen(
  props: React.ComponentProps<typeof DesktopWarehouseView>,
) {
  return <DesktopWarehouseView {...props} />;
}
