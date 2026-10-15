"use client";
import type { JSX } from "react";
import { Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SearchInput } from "../common/SearchInput";
interface Props {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
}

/** 목록별 접근성 이름을 지원하며 모바일의 기존 기본 검색 문구를 보존한다. */
export function DefectSearchInput({ value, onChange, ariaLabel = "불량 검색", placeholder = "품명 · 품목 코드 · 부서 · 사유 · 처리자 검색" }: Props): JSX.Element {
  return <SearchInput value={value} onChange={onChange} ariaLabel={ariaLabel} clearAriaLabel={`${ariaLabel} 지우기`}
    placeholder={placeholder} inputProps={{ type: "search" }}
    className="w-full min-w-[240px] focus-within:ring-offset-2"
    leading={<Search aria-hidden size={16} className="shrink-0" style={{ color: LEGACY_COLORS.blue }} />} />;
}
