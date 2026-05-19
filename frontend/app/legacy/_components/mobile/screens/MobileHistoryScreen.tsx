"use client";

import { DesktopHistoryView } from "../../DesktopHistoryView";

/**
 * 입출고 내역 모바일 화면.
 *
 * Phase A: 데스크탑 뷰 패스스루. Phase B-3 에서 카드형 로그 리스트 +
 * 바텀시트 상세 + 필터 칩으로 내부 교체(historyShared 로직 재사용).
 */
export function MobileHistoryScreen() {
  return <DesktopHistoryView />;
}
