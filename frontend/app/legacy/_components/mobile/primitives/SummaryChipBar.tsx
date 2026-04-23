"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export type SummaryChip = {
  key: string;
  label: string;
  tone?: string;
  onClick?: () => void;
  onRemove?: () => void;
};

export function SummaryChipBar({
  chips,
  trailing,
  className,
}: {
  chips: SummaryChip[];
  trailing?: React.ReactNode;
  className?: string;
}) {
  if (chips.length === 0 && !trailing) return null;
  return (
    <div className={clsx("flex items-center gap-2 overflow-x-auto scrollbar-hide", className)}>
      {chips.map((chip) => {
        const tone = chip.tone ?? LEGACY_COLORS.blue;
        const Wrapper = chip.onClick ? "button" : "div";
        return (
          <Wrapper
            key={chip.key}
            type={chip.onClick ? "button" : undefined}
            onClick={chip.onClick}
            className={clsx(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-[6px] font-semibold transition-[transform,opacity]",
              chip.onClick && "active:scale-95",
              TYPO.caption,
            )}
            style={{
              background: `${tone as string}1a`,
              borderColor: `${tone as string}44`,
              color: tone,
            }}
          >
            <span className="truncate max-w-[160px]">{chip.label}</span>
            {chip.onRemove ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  chip.onRemove?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    chip.onRemove?.();
                  }
                }}
                className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                style={{ background: `${tone as string}33` }}
                aria-label="제거"
              >
                <X size={11} strokeWidth={2.5} />
              </span>
            ) : null}
          </Wrapper>
        );
      })}
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
