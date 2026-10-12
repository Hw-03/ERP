import type { CSSProperties } from "react";

/** 대시보드의 시작선과 하단 탭바 끝선에 모바일 상세창을 맞춘다. */
export const MOBILE_MODAL_VIEWPORT_STYLE = {
  height: "100dvh",
  paddingTop: "calc(env(safe-area-inset-top, 18px) + 20px)",
  paddingBottom: "calc(env(safe-area-inset-bottom, 10px) + 8px)",
} satisfies CSSProperties;
