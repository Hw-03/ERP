import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function MetaCell({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div
      className="rounded-[12px] border px-3 py-2.5"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="text-[12px] font-bold tracking-[0.08em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div
        className={`mt-0.5 text-[14px] font-black ${mono ? "font-mono" : ""}`}
        style={{ color: tone ?? LEGACY_COLORS.text }}
      >
        {value}
      </div>
    </div>
  );
}

export function DetailCardSlot({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="mb-3 flex items-center gap-1.5 text-[12px] font-black tracking-[0.12em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
