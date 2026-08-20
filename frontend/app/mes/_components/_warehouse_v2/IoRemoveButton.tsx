import type { MouseEventHandler } from "react";
import { Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface IoRemoveButtonProps {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
}

/** Keeps destructive controls identical across bundle headers and quantity rows. */
export function IoRemoveButton({ label, onClick, className = "", disabled }: IoRemoveButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={{ color: LEGACY_COLORS.red, background: tint(LEGACY_COLORS.red, 10) }}
    >
      <Trash2 aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
