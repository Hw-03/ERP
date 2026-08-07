"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface DesktopWorkHubCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: string;
  onClick: () => void;
  active?: boolean;
  meta?: ReactNode;
  dataTestId?: string;
  shippingHubCardId?: string;
  className?: string;
  size?: "default" | "large";
}

/** 데스크톱 업무 진입 허브에서 공유하는 제목·배지·안내문 카드입니다. */
export function DesktopWorkHubCard({
  icon: Icon,
  title,
  description,
  tone,
  onClick,
  active,
  meta,
  dataTestId,
  shippingHubCardId,
  className,
  size = "default",
}: DesktopWorkHubCardProps) {
  const large = size === "large";
  return (
    <button
      type="button"
      data-testid={dataTestId}
      data-shipping-hub-card={shippingHubCardId}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-full min-h-0 min-w-0 flex-col items-start justify-between gap-6 rounded-[22px] border p-7 text-left transition-all hover:brightness-110 active:scale-[0.99] xl:p-8 ${className ?? ""}`}
      style={{
        background: active ? tint(tone, 14) : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        borderWidth: active ? 2 : 1,
        color: active ? tone : LEGACY_COLORS.text,
      }}
    >
      <div className="flex w-full items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Icon className={`${large ? "h-10 w-10" : "h-8 w-8"} shrink-0`} style={{ color: tone }} />
          <span className={`min-w-0 font-black leading-tight ${large ? "text-4xl" : "text-3xl xl:text-4xl"}`} style={{ color: LEGACY_COLORS.text }}>
            {title}
          </span>
        </div>
        {meta}
      </div>
      <span className={`mt-auto font-black leading-tight ${large ? "text-xl" : "text-sm xl:text-base"}`} style={{ color: active ? tone : LEGACY_COLORS.muted2 }}>
        {description}
      </span>
    </button>
  );
}
