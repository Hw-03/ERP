/** 입출고 요청 유형 표시 라벨 — DraftCartItemRow / WarehouseQueueRow / MyRequestRow 공용.
 *  단일 사전은 `frontend/lib/io/glossary.ts` (P0-1). 본 파일은 backward-compat re-export. */
import type { StockRequestLine } from "@/lib/api";
import { REQUEST_TYPE_LABEL as _GLOSSARY_REQUEST_TYPE_LABEL } from "@/lib/io/glossary";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

export const REQUEST_TYPE_LABEL: Record<string, string> = _GLOSSARY_REQUEST_TYPE_LABEL;

export type RequestQuantityTone = "positive" | "negative" | "movement" | "neutral";

interface RequestStatusPresentation {
  label: string;
  color: string;
}

type RequestStatusPresentationTuple = readonly [label: string, color: string];

const REQUEST_STATUS_PRESENTATION: Record<string, RequestStatusPresentationTuple> = {
  draft: ["임시저장", LEGACY_COLORS.muted2],
  submitted: ["승인 대기", LEGACY_COLORS.yellow],
  reserved: ["승인 대기", LEGACY_COLORS.yellow],
  rejected: ["반려", LEGACY_COLORS.red],
  cancelled: ["취소", LEGACY_COLORS.muted2],
  completed: ["완료", LEGACY_COLORS.green],
  failed_approval: ["승인 실패", LEGACY_COLORS.red],
};

/** 내부 상태 코드는 유지하면서 요청 카드의 사용자용 상태 표현을 통일한다. */
export function getRequestStatusPresentation(status: string): RequestStatusPresentation {
  const presentation = REQUEST_STATUS_PRESENTATION[status];
  return presentation
    ? { label: presentation[0], color: presentation[1] }
    : { label: status, color: LEGACY_COLORS.muted2 };
}

/** 재고 전후값을 노출하지 않고 요청 라인의 입고·출고·이동 의미만 표현한다. */
export function getRequestQuantityPresentation(
  line: Pick<StockRequestLine, "quantity" | "from_bucket" | "to_bucket">,
): { text: string; tone: RequestQuantityTone } {
  const quantity = formatQty(line.quantity);
  const hasSource = line.from_bucket !== "none";
  const hasDestination = line.to_bucket !== "none";

  if (!hasSource && hasDestination) return { text: `+${quantity}개`, tone: "positive" };
  if (hasSource && !hasDestination) return { text: `-${quantity}개`, tone: "negative" };
  if (hasSource && hasDestination) return { text: `이동 ${quantity}개`, tone: "movement" };
  return { text: `${quantity}개`, tone: "neutral" };
}

/**
 * 비고(notes) 사용자 표시용 정리.
 * 일부 흐름(분해 등)은 구조화 JSON(child_decisions …)을 notes 에 저장한다.
 * 원시 JSON 을 그대로 노출하지 않고, 사람이 읽을 요약/메모만 반환. 없으면 null(숨김).
 * 일반 텍스트 메모는 그대로 반환.
 */
export function formatRequestNotes(notes: string | null | undefined): string | null {
  const raw = (notes ?? "").trim();
  if (!raw) return null;
  if (raw[0] !== "{" && raw[0] !== "[") return raw; // 일반 메모
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw; // JSON 아님 → 일반 메모로 취급
  }
  const memos: string[] = [];
  const collect = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(collect);
      return;
    }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if ((k === "reason_memo" || k === "memo") && typeof val === "string" && val.trim()) {
        memos.push(val.trim());
      } else if (val && typeof val === "object") {
        collect(val);
      }
    }
  };
  collect(parsed);
  const parts: string[] = [];
  const cd = (parsed as { child_decisions?: unknown }).child_decisions;
  if (Array.isArray(cd)) parts.push(`하위 분해 ${cd.length}건`);
  if (memos.length) parts.push(memos.join(" · "));
  return parts.length ? parts.join(" — ") : null;
}
