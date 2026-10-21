"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { SearchInput } from "../../common/SearchInput";

export function BomSearchInput({ value, onChange, placeholder = "품목명 / 코드 검색", bg = LEGACY_COLORS.s2 as string, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  bg?: string;
  disabled?: boolean;
}) {
  return <SearchInput disabled={disabled} value={value} onChange={onChange} placeholder={placeholder} className="h-9 !min-h-9 rounded-lg" inputProps={{ className: "!h-8" }} style={{ background: bg }} />;
}
