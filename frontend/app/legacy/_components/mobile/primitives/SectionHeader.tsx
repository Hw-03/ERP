"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function SectionHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-end justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-col">
        {subtitle ? (
          <div
            className={clsx(TYPO.caption, "font-semibold uppercase tracking-[1.2px]")}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {subtitle}
          </div>
        ) : null}
        <div className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.text }}>
          {title}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
