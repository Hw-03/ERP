"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";
import { IconButton } from "./IconButton";

export function SheetHeader({
  title,
  subtitle,
  onClose,
  rightAction,
  className,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-3 px-5 pb-3 pt-2", className)}>
      <div className="flex min-w-0 flex-col">
        <div className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.text }}>
          {title}
        </div>
        {subtitle ? (
          <div className={clsx(TYPO.caption, "mt-[2px]")} style={{ color: LEGACY_COLORS.muted2 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {rightAction}
        {onClose ? <IconButton icon={X} label="닫기" onClick={onClose} size="sm" /> : null}
      </div>
    </div>
  );
}
