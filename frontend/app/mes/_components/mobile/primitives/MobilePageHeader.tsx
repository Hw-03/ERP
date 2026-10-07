"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { IconButton } from "./IconButton";

/** 업무 제목과 이동 버튼을 같은 터치·정렬 규칙으로 표시한다. 바깥 여백은 화면이 소유한다. */
export function MobilePageHeader({ title, subtitle, onBack, backLabel = "뒤로", right, onTitleClick, disabled = false, className = "" }: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  onTitleClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const label = <>
    {subtitle && <span className="block text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{subtitle}</span>}
    <span className="line-clamp-2 break-words text-lg font-bold leading-snug">{title}</span>
  </>;
  return <header className={`flex min-h-[60px] shrink-0 items-center gap-2 rounded-[20px] border p-2 ${className}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
    {onBack && <IconButton icon={ArrowLeft} label={backLabel} onClick={onBack} disabled={disabled} />}
    {onTitleClick ? <button type="button" onClick={onTitleClick} disabled={disabled} className="min-h-11 min-w-0 flex-1 rounded-[14px] px-2 text-left active:scale-[0.99] disabled:opacity-40">{label}</button> : <div className={`min-w-0 flex-1 ${onBack ? "" : "px-2"}`}>
      {subtitle && <p className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>{subtitle}</p>}
      <h1 className="line-clamp-2 break-words text-lg font-bold leading-snug">{title}</h1>
    </div>}
    {right}
  </header>;
}
