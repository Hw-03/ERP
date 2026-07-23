"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DOMAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import type { Item } from "@/lib/api";
import { Tooltip } from "@/lib/ui";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BomBadge } from "./BomBadge";

export const BOM_EDIT_LIST_GRID_TEMPLATE = "52px minmax(0, 1fr) 78px 44px";
export const BOM_CURRENT_ROW_GRID_TEMPLATE = "52px minmax(0, 1fr) 78px 72px 28px";
export const BOM_ROW_SURFACE_CLASS_NAME = "grid items-center gap-3 border-b px-3 py-2 transition-colors duration-150 hover:bg-[var(--c-s4)]";

export function bomRowSurfaceStyle({
  gridTemplateColumns,
  background,
  borderBottom = true,
}: {
  gridTemplateColumns: string;
  background?: string;
  borderBottom?: boolean;
}): CSSProperties {
  return {
    gridTemplateColumns,
    background,
    borderBottom: borderBottom ? `1px solid ${LEGACY_COLORS.border}` : undefined,
  };
}

function useBomNameOverflow(itemName: string) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) return;

    const check = () => setIsOverflow(element.scrollWidth > element.clientWidth);
    check();

    try {
      const observer = new ResizeObserver(check);
      observer.observe(element);
      return () => observer.disconnect();
    } catch {
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }
  }, [itemName]);

  return { nameRef, isOverflow };
}

interface BomRowTooltipProps {
  itemName: string;
  children: (props: {
    nameRef: RefObject<HTMLSpanElement>;
    actionTooltipProps: Pick<DOMAttributes<HTMLElement>,
      "onMouseEnter" | "onMouseLeave" | "onMouseOverCapture" | "onMouseOutCapture" | "onFocusCapture" | "onBlurCapture">;
  }) => ReactNode;
}

export function BomRowTooltip({ itemName, children }: BomRowTooltipProps) {
  const { nameRef, isOverflow } = useBomNameOverflow(itemName);
  const [isActionActive, setIsActionActive] = useState(false);
  const actionTooltipProps: Pick<DOMAttributes<HTMLElement>,
    "onMouseEnter" | "onMouseLeave" | "onMouseOverCapture" | "onMouseOutCapture" | "onFocusCapture" | "onBlurCapture"> = {
    onMouseEnter: () => setIsActionActive(true),
    onMouseLeave: () => setIsActionActive(false),
    onMouseOverCapture: (event) => {
      setIsActionActive(true);
      event.stopPropagation();
    },
    onMouseOutCapture: () => setIsActionActive(false),
    onFocusCapture: (event) => {
      setIsActionActive(true);
      event.stopPropagation();
    },
    onBlurCapture: () => setIsActionActive(false),
  };

  return (
    <Tooltip
      content={itemName}
      disabled={!isOverflow || isActionActive}
      multiline
      triggerClassName="relative block min-w-0 w-full"
    >
      {children({ nameRef, actionTooltipProps })}
    </Tooltip>
  );
}

type HeaderVariant = "parent" | "whereused" | "candidate" | "current";

const HEADER_COLUMNS: Record<HeaderVariant, readonly [string, string?][]> = {
  parent: [["공정"], ["품목명"], ["품목 코드"], ["상태", "justify-self-end"]],
  whereused: [["공정"], ["품목명"], ["품목 코드"]],
  candidate: [["공정"], ["품목명"], ["품목 코드"], ["추가", "justify-self-end"]],
  current: [["공정"], ["품목명"], ["품목 코드"], ["수량", "justify-self-center"], ["삭제", "justify-self-center"]],
};

interface BomTableHeaderProps {
  variant: HeaderVariant;
  gridTemplateColumns: string;
}

export function BomTableHeader({ variant, gridTemplateColumns }: BomTableHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10 grid items-center gap-3 px-3 py-2 text-[11px] font-bold uppercase tracking-[1.5px]"
      style={{
        gridTemplateColumns,
        background: "var(--c-popup-bg)",
        borderBottom: `1px solid ${LEGACY_COLORS.border}`,
        color: LEGACY_COLORS.muted2,
      }}
    >
      {HEADER_COLUMNS[variant].map(([label, className], index) => (
        <span key={label} className={index === 0 ? `justify-self-center ${className ?? ""}` : className}>{label}</span>
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
  borderBottom = true,
  disabled = false,
  pressed,
}: BomTableItemRowProps) {
  return (
    <BomRowTooltip itemName={item.item_name}>
      {({ nameRef }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={pressed}
      data-bom-row-surface
      className={`${BOM_ROW_SURFACE_CLASS_NAME} no-btn-inset w-full text-left disabled:cursor-not-allowed disabled:opacity-50`}
      style={bomRowSurfaceStyle({ gridTemplateColumns, background, borderBottom })}
    >
      <BomBadge processTypeCode={item.process_type_code} small />
      <span
        ref={nameRef}
        data-bom-row-label
        className="min-w-0 truncate text-sm font-semibold"
        style={{ color: LEGACY_COLORS.text }}
      >
        {item.item_name}
      </span>
      <span
        data-bom-row-code
        className="min-w-0 truncate text-xs"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {item.mes_code || "—"}
      </span>
      {trailing}
    </button>
      )}
    </BomRowTooltip>
  );
}
