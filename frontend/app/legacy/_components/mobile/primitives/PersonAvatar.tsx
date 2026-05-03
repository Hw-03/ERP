"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { firstEmployeeLetter } from "@/lib/mes/employee";
import { useDeptColor } from "../../DepartmentsContext";
import { TYPO } from "../tokens";

type Size = "sm" | "md" | "lg";
const SIZE: Record<Size, { box: string; text: string }> = {
  sm: { box: "h-9 w-9", text: TYPO.caption },
  md: { box: "h-11 w-11", text: TYPO.body },
  lg: { box: "h-14 w-14", text: TYPO.title },
};

export function PersonAvatar({
  name,
  department,
  selected = false,
  onClick,
  size = "md",
  showLabel = true,
  className,
}: {
  name: string;
  department?: string | null;
  selected?: boolean;
  onClick?: () => void;
  size?: Size;
  showLabel?: boolean;
  className?: string;
}) {
  const color = useDeptColor(department);
  const { box, text } = SIZE[size];

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("flex shrink-0 flex-col items-center gap-1 active:scale-95", className)}
    >
      <div
        className={clsx(
          "flex items-center justify-center rounded-full font-black uppercase",
          box,
          text,
        )}
        style={{
          background: selected ? color : `${color}22`,
          color: selected ? LEGACY_COLORS.white : color,
          border: `2px solid ${selected ? color : "transparent"}`,
          transition: "background-color .15s, border-color .15s",
        }}
      >
        {firstEmployeeLetter(name)}
      </div>
      {showLabel ? (
        <div className={clsx(TYPO.caption, "font-semibold")} style={{ color: selected ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
          {name}
        </div>
      ) : null}
    </button>
  );
}
