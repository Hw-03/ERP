"use client";

import type { ReactElement } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface Props {
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
  summary?: string;
}

/** 접힌 상태에서도 현재 조건을 읽을 수 있는 불량 화면 공통 필터 표시. */
export function DefectFilterDisclosure({ expanded, onToggle, controlsId, summary }: Props): ReactElement {
  return (
    <div className="flex min-h-11 min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={expanded ? "필터 접기" : "필터 펼치기"}
        aria-expanded={expanded}
        aria-controls={controlsId}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] border px-3 py-2 text-sm font-semibold transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]"
        style={{
          background: expanded ? tint(LEGACY_COLORS.blue, 14) : LEGACY_COLORS.s2,
          borderColor: expanded ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
          color: expanded ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
        }}
      >
        <Filter className="h-4 w-4" />
        필터
        <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: expanded ? "rotate(180deg)" : undefined }} />
      </button>
      {summary && <span className="min-w-0 break-words text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{summary}</span>}
    </div>
  );
}
