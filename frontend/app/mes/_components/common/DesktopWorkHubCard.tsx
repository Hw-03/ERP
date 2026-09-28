"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import styles from "./IoWorkCard.module.css";

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
  imageSrc?: string;
  imageSize?: "default" | "compact";
  appearance?: "default" | "io";
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
  imageSrc,
  imageSize = "default",
  appearance = "default",
}: DesktopWorkHubCardProps) {
  const compactImage = imageSize === "compact";
  const ioAppearance = appearance === "io";
  return (
    <button
      type="button"
      data-testid={dataTestId}
      data-shipping-hub-card={shippingHubCardId}
      data-appearance={ioAppearance ? "io" : undefined}
      aria-pressed={active}
      onClick={onClick}
      className={`desktop-work-hub-card standard-hover no-btn-inset relative flex h-full min-h-0 min-w-0 flex-col items-start justify-between gap-6 overflow-hidden rounded-[22px] border text-left transition-all active:scale-[0.99] ${ioAppearance ? styles.hub : "p-7 xl:p-8"} ${className ?? ""}`}
      style={{
        background: ioAppearance ? tint(tone, active ? 16 : 7) : active ? tint(tone, 14) : LEGACY_COLORS.s2,
        borderColor: active ? tone : ioAppearance ? tint(tone, 25) : LEGACY_COLORS.border,
        borderWidth: active ? 2 : 1,
        color: active ? tone : LEGACY_COLORS.text,
      }}
    >
      <div className="flex w-full items-start justify-between gap-4">
        <div className={ioAppearance ? styles.hubHeading : "flex min-w-0 items-center gap-4"}>
          <Icon className={ioAppearance ? styles.hubIcon : "h-10 w-10 shrink-0"} style={{ color: tone }} />
          <span className={`min-w-0 font-black leading-tight ${ioAppearance ? styles.hubTitle : "text-[40px]"}`} style={{ color: LEGACY_COLORS.text }}>
            {title}
          </span>
        </div>
        {meta}
      </div>
      {imageSrc && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute flex items-end justify-end ${compactImage ? "bottom-12 right-6 h-[105px] w-[145px]" : "bottom-16 right-8 h-[155px] w-[220px]"}`}
        >
          <Image src={imageSrc} alt="" width={840} height={560} sizes={compactImage ? "145px" : "220px"} className="h-full w-full object-contain object-right-bottom" draggable={false} />
        </div>
      )}
      <span className={`relative z-[1] mt-auto w-full font-black leading-tight ${ioAppearance ? styles.hubDescription : "whitespace-nowrap text-xl"}`} style={{ color: active ? tone : LEGACY_COLORS.muted2 }}>
        {description}
      </span>
    </button>
  );
}
