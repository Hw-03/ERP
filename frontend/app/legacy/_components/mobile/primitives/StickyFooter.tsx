"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "../../legacyUi";

export function StickyFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx("sticky bottom-0 z-30 border-t px-4 pt-3", className)}
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        paddingBottom: "calc(env(safe-area-inset-bottom, 12px) + 12px)",
        boxShadow: "0 -12px 24px rgba(0,0,0,.24)",
      }}
    >
      {children}
    </div>
  );
}
