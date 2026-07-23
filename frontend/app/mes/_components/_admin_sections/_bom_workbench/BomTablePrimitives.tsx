"use client";

import type { ReactNode } from "react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BomBadge } from "./BomBadge";

export const BOM_EDIT_LIST_GRID_TEMPLATE = "52px minmax(0, 1fr) minmax(0, 0.82fr) 72px";

type HeaderVariant = "parent" | "whereused" | "candidate" | "current";

const HEADER_COLUMNS: Record<HeaderVariant, readonly [string, string?][]> = {
  parent: [["공정"], ["품목명"], ["품목 코드"], ["상태", "text-right"]],
  whereused: [["공정"], ["품목명"], ["품목 코드"]],
  candidate: [["공정"], ["품목명"], ["품목 코드"], ["추가", "text-right"]],
  current: [["공정"], ["품목명"], ["품목 코드"], ["수량", "text-right"], ["삭제", "text-center"]],
};

interface BomTableHeaderProps {
  variant: HeaderVariant;
  gridTemplateColumns: string;
  background: string;
}

export function BomTableHeader({ variant, gridTemplateColumns, background }: BomTableHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10 grid items-center gap-3 px-3 py-2 text-[12px] font-bold uppercase tracking-wider"
      style={{
        gridTemplateColumns,
        background,
        borderBottom: `1px solid ${LEGACY_COLORS.border}`,
        color: LEGACY_COLORS.muted2,
      }}
    >
      {HEADER_COLUMNS[variant].map(([label, className]) => (
        <span key={label} className={className}>{label}</span>
      ))}
    </div>
  );
}

interface BomTableItemRowProps {
  item: Pick<Item, "item_name" | "mes_code" | "process_type_code">;
  gridTemplateColumns: string;
  onClick: () => void;
  trailing: ReactNode;
  background?: string;
  borderBottom?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}

export function BomTableItemRow({
  item,
  gridTemplateColumns,
  onClick,
  trailing,
  background,
  borderBottom = false,
  disabled = false,
  pressed,
}: BomTableItemRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={pressed}
      className="grid w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--c-s4)] disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        gridTemplateColumns,
        background,
        borderBottom: borderBottom ? `1px solid ${LEGACY_COLORS.border}` : undefined,
      }}
    >
      <BomBadge processTypeCode={item.process_type_code} small />
      <span
        data-bom-row-label
        title={item.item_name}
        className="min-w-0 truncate text-sm font-semibold"
        style={{ color: LEGACY_COLORS.text }}
      >
        {item.item_name}
      </span>
      <span
        title={item.mes_code ?? undefined}
        className="min-w-0 truncate text-xs"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {item.mes_code || "—"}
      </span>
      {trailing}
    </button>
  );
}
