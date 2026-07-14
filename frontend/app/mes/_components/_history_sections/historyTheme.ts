/**
 * historyTheme.ts — 행 tint 색 + 공정 타입 메타 순수 상수/함수.
 * C2: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */
import { LEGACY_COLORS } from "@/lib/mes/color";

/** 거래 타입별 행 배경 tint (투명도 낮은 색조). */
export function rowTint(type: string): string {
  switch (type) {
    case "RECEIVE":
    case "PRODUCE":
      return "rgba(67,211,157,.05)";
    case "SHIP":
    case "BACKFLUSH":
    case "INTERNAL_USE":
      return "rgba(255,123,123,.05)";
    case "ADJUST":
      return "rgba(101,169,255,.05)";
    case "TRANSFER_TO_PROD":
    case "TRANSFER_TO_WH":
    case "TRANSFER_DEPT":
      return "rgba(78,201,245,.05)";
    default:
      return "transparent";
  }
}

/** 공정 타입 코드별 라벨·색·배경. */
export const PROCESS_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  TR: { label: "튜브 원자재", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TA: { label: "튜브 중간공정", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TF: { label: "튜브 공정완료", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  HR: { label: "고압 원자재", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  HA: { label: "고압 중간공정", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  HF: { label: "고압 공정완료", color: LEGACY_COLORS.yellow, bg: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)` },
  VR: { label: "진공 원자재", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  VA: { label: "진공 중간공정", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  VF: { label: "진공 공정완료", color: LEGACY_COLORS.purple, bg: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)` },
  NR: { label: "튜닝 원자재", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  NA: { label: "튜닝 중간공정", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  NF: { label: "튜닝 공정완료", color: "#f97316", bg: "color-mix(in srgb, #f97316 16%, transparent)" },
  AR: { label: "조립 원자재", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  AA: { label: "조립 중간공정", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  AF: { label: "조립 공정완료", color: "#818cf8", bg: "color-mix(in srgb, #818cf8 16%, transparent)" },
  PR: { label: "출하 원자재", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
  PA: { label: "출하 중간공정", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
  PF: { label: "출하 공정완료", color: LEGACY_COLORS.green, bg: `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)` },
};
