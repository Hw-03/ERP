import type { StocktakeWorkPause } from "@/lib/api/types/io";
import type { JSX } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function stocktakePauseLabel(pause: StocktakeWorkPause): string {
  if (pause.missing_target_count > 0) return "조사 대상 확인 필요";
  return pause.state === "ready" ? "이어서 작업 가능" : "재고 조사 중";
}

export function StocktakePauseNotice({ pause }: { pause?: StocktakeWorkPause | null }): JSX.Element | null {
  if (!pause) return null;
  return <p role="status" className="mt-2 text-sm leading-6" style={{ color: pause.state === "ready" ? LEGACY_COLORS.blue : LEGACY_COLORS.yellow }}>{stocktakePauseLabel(pause)}</p>;
}
