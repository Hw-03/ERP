"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted }}
      >
        <Icon size={24} strokeWidth={1.75} />
      </div>
      <div className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.text }}>
        {title}
      </div>
      {description ? (
        <div className={clsx(TYPO.body)} style={{ color: LEGACY_COLORS.muted2 }}>
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
