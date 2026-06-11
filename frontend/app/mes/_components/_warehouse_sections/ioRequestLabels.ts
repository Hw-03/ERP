/** 입출고 요청 유형 표시 라벨 — DraftCartItemRow / WarehouseQueueRow / MyRequestRow 공용.
 *  단일 사전은 `frontend/lib/io/glossary.ts` (P0-1). 본 파일은 backward-compat re-export. */
import { REQUEST_TYPE_LABEL as _GLOSSARY_REQUEST_TYPE_LABEL } from "@/lib/io/glossary";

export const REQUEST_TYPE_LABEL: Record<string, string> = _GLOSSARY_REQUEST_TYPE_LABEL;

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
