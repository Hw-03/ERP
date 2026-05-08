"use client";

import { Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function BomSearchInput({
  value,
  onChange,
  placeholder = "품목명 / 코드 검색",
  bg = LEGACY_COLORS.s2 as string,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  bg?: string;
}) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: LEGACY_COLORS.muted2 }} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border py-1.5 pl-9 pr-3 text-sm outline-none"
        style={{ background: bg, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
      />
    </div>
  );
}
