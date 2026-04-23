"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  padding = "md",
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  padding?: "none" | "sm" | "md";
  className?: string;
}) {
  const pad = padding === "none" ? "p-0" : padding === "sm" ? "p-3" : "p-4";
  return (
    <div
      className={clsx("rounded-[20px] border overflow-hidden", className)}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      {title || action ? (
        <div
          className="flex items-center justify-between gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          <div className="min-w-0">
            {title ? (
              <div
                className={clsx(TYPO.overline, "font-bold uppercase tracking-[2px]")}
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div
                className={clsx(TYPO.body, "font-semibold")}
                style={{ color: LEGACY_COLORS.text }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={pad}>{children}</div>
    </div>
  );
}

export function SectionCardRow({
  label,
  value,
  valueColor,
  className,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center justify-between py-[6px]", className)}>
      <span className={clsx(TYPO.caption, "font-semibold")} style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      <span
        className={clsx(TYPO.body, "font-black text-right")}
        style={{ color: valueColor ?? LEGACY_COLORS.text }}
      >
        {value}
      </span>
    </div>
  );
}
