import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../common/EmptyState";

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
      className="flex min-h-0 flex-1 flex-col rounded-[20px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <EmptyState illustrated comfortable icon={icon} title={title} description={description} action={action} />
    </section>
  );
}
