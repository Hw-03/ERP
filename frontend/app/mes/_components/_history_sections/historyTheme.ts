/**
 * historyTheme.ts — 행 tint 색 + 공정 타입 메타 순수 상수/함수.
 * C2: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */
import { processTypeColor } from "@/lib/mes/process";

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
function processTypeMeta(code: string, label: string): { label: string; color: string; bg: string } {
  const color = processTypeColor(code);
  return { label, color, bg: `color-mix(in srgb, ${color} 16%, transparent)` };
}

export const PROCESS_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  TR: processTypeMeta("TR", "튜브 원자재"),
  TA: processTypeMeta("TA", "튜브 중간공정"),
  TF: processTypeMeta("TF", "튜브 공정완료"),
  HR: processTypeMeta("HR", "고압 원자재"),
  HA: processTypeMeta("HA", "고압 중간공정"),
  HF: processTypeMeta("HF", "고압 공정완료"),
  VR: processTypeMeta("VR", "진공 원자재"),
  VA: processTypeMeta("VA", "진공 중간공정"),
  VF: processTypeMeta("VF", "진공 공정완료"),
  NR: processTypeMeta("NR", "튜닝 원자재"),
  NA: processTypeMeta("NA", "튜닝 중간공정"),
  NF: processTypeMeta("NF", "튜닝 공정완료"),
  AR: processTypeMeta("AR", "조립 원자재"),
  AA: processTypeMeta("AA", "조립 중간공정"),
  AF: processTypeMeta("AF", "조립 공정완료"),
  PR: processTypeMeta("PR", "출하 원자재"),
  PA: processTypeMeta("PA", "출하 중간공정"),
  PF: processTypeMeta("PF", "출하 공정완료"),
};
