"use client";

import { DesktopAdminView } from "../../DesktopAdminView";

/**
 * 관리자 모바일 화면.
 *
 * Phase A: 데스크탑 뷰 패스스루. Phase B-5 에서 섹션 허브(리스트→드릴다운)
 * + 모바일 PIN 게이트로 내부 교체(admin 훅 재사용).
 */
export function MobileAdminScreen(
  props: React.ComponentProps<typeof DesktopAdminView>,
) {
  return <DesktopAdminView {...props} />;
}
