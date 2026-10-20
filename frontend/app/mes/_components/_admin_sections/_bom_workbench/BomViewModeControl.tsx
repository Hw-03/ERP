"use client";

import { ArrowRightLeft, Pencil } from "lucide-react";
import type { ReactElement } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";

/** 로딩과 실제 화면에서 전환 버튼의 크기를 동일하게 유지한다. */
export function BomViewModeControl({ mode, onChange, disabled = false }: {
  mode: "edit" | "whereused";
  onChange: (mode: "edit" | "whereused") => void;
  disabled?: boolean;
}): ReactElement {
  return <div role="group" aria-label="BOM 보기 방식" className="flex h-11 w-[168px] items-center gap-1 rounded-full border"
    style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
    {(["edit", "whereused"] as const).map(value => <Button
      key={value}
      disabled={disabled}
      variant={mode === value ? "primary" : "ghost"}
      size="sm"
      iconLeft={value === "edit" ? <Pencil size={13} /> : <ArrowRightLeft size={13} />}
      onClick={() => onChange(value)}
      className="h-11 min-w-[82px] rounded-full"
      style={mode === value
        ? { background: LEGACY_COLORS.blueSolid, color: LEGACY_COLORS.white, borderColor: "transparent" }
        : { background: "transparent", color: LEGACY_COLORS.muted, borderColor: "transparent" }}
    >{value === "edit" ? "편집" : "사용처"}</Button>)}
  </div>;
}
