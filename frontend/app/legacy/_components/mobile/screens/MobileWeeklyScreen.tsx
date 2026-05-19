"use client";

import { DesktopWeeklyReportView } from "../../DesktopWeeklyReportView";

/**
 * 주간보고 모바일 화면.
 *
 * Phase A: 데스크탑 뷰 패스스루. Phase B-4 에서 totalQty 문자열 연결 버그
 * 수정 + 모델별 카드 세로 리스트로 내부 교체.
 */
export function MobileWeeklyScreen(
  props: React.ComponentProps<typeof DesktopWeeklyReportView>,
) {
  return <DesktopWeeklyReportView {...props} />;
}
