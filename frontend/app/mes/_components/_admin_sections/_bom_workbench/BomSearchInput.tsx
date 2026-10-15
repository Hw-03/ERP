"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { SearchInput } from "../../common/SearchInput";

export function BomSearchInput({ value, onChange, placeholder = "품목명 / 코드 검색", bg = LEGACY_COLORS.s2 as string }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  bg?: string;
}) {
  return <SearchInput value={value} onChange={onChange} placeholder={placeholder} className="rounded-lg" style={{ background: bg }} />;
}
