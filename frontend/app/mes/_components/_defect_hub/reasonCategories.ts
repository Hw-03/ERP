/**
 * 불량 처리 사유 카테고리 상수 — `_defect_hub/reasonCategories`.
 * 백엔드에는 자유 문자열로 전달. 프론트 공통 상수.
 */

export const REASON_CATEGORIES = [
  "외관 불량",
  "치수 불량",
  "기능 불량",
  "검사 통과",
  "누유",
  "이물질",
  "고압",
  "10A",
  "선광불량",
  "mA 불량",
  "KV 불량",
  "파형 불량",
  "기타",
] as const;

export type ReasonCategory = (typeof REASON_CATEGORIES)[number];
