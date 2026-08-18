import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

interface WarehouseEmptyWorkAreaProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function WarehouseEmptyWorkArea({
  icon,
  title,
  description,
  action,
}: WarehouseEmptyWorkAreaProps) {
  return (
    <section
      data-testid="warehouse-empty-work-area"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[20px] border px-6 py-8 text-center"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="[&>svg]:h-8 [&>svg]:w-8">{icon}</div>
      <div className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
        {title}
      </div>
      <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
        {description}
      </p>
      {action && (
        <button
          type="button"
          className="min-h-11 rounded-[12px] px-4 py-2 text-sm font-bold transition-colors hover:brightness-110 active:scale-[0.98]"
          style={{ background: LEGACY_COLORS.blueSolid, color: LEGACY_COLORS.white }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </section>
  );
}
