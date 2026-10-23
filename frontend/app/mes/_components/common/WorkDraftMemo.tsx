import type { JSX } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

/** 접힌 목록은 두 줄, 상세는 저장된 줄바꿈 전체를 표시한다. */
export function WorkDraftMemo({ notes, expanded = false, showEmpty = false }: {
  notes: string | null | undefined;
  expanded?: boolean;
  showEmpty?: boolean;
}): JSX.Element | null {
  if (!notes?.trim()) return showEmpty ? <span className="block w-full text-center" style={{ color: LEGACY_COLORS.muted2 }}>—</span> : null;
  return <p aria-label="작업 메모" className={`min-w-0 whitespace-pre-wrap break-words text-left text-sm font-normal leading-5 [overflow-wrap:anywhere]${expanded ? "" : " line-clamp-2"}`}
    style={{ color: LEGACY_COLORS.muted2 }}>{notes}</p>;
}
