"use client";
import type { JSX } from "react";
import { Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
}

/** 목록별 접근성 이름을 지원하며 모바일의 기존 기본 검색 문구를 보존한다. */
export function DefectSearchInput({ value, onChange, ariaLabel = "불량 검색", placeholder = "품명 · 품목 코드 · 부서 · 사유 · 처리자 검색" }: Props): JSX.Element {
  return <div className="flex min-h-11 w-full min-w-[240px] items-center gap-2 rounded-[14px] border px-3 focus-within:ring-2 focus-within:ring-[var(--c-blue)] focus-within:ring-offset-2" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
    <Search className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
    <input type="search" aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" style={{ color: LEGACY_COLORS.text }} />
    {value && <button type="button" aria-label={`${ariaLabel} 지우기`} onClick={() => onChange("")} className="flex min-h-11 min-w-11 items-center justify-center rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]" style={{ color: LEGACY_COLORS.muted2 }}><X className="h-4 w-4" /></button>}
  </div>;
}
