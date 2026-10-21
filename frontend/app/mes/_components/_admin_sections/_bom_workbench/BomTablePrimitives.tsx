"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type DOMAttributes,
  type ReactNode,
  type ReactElement,
  type RefObject,
} from "react";
import type { Item } from "@/lib/api";
import { Tooltip } from "@/lib/ui";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BomBadge } from "./BomBadge";
import listPerformance from "../AdminListPerformance.module.css";
import type { StageLetter } from "./bomDept";

export const BOM_EDIT_LIST_GRID_TEMPLATE = "40px minmax(0, 1fr) clamp(78px, 5.75vw, 110px) 64px";
export const BOM_CURRENT_ROW_GRID_TEMPLATE = "40px minmax(0, 1fr) clamp(78px, 5.75vw, 110px) 72px 28px";
export const BOM_WHERE_USED_ROW_GRID_TEMPLATE = "40px minmax(0, 1fr) clamp(78px, 5.75vw, 110px) 72px";
export const BOM_SEARCH_BAR_CLASS_NAME = "flex h-12 shrink-0 items-center gap-3 px-4";
export const BOM_FILTER_BAR_CLASS_NAME = "flex h-10 shrink-0 items-center border-b border-[var(--c-border)] px-4";
export const BOM_ROW_SURFACE_CLASS_NAME = "grid h-[37px] items-center gap-2 border-b px-3 transition-colors duration-150 hover:bg-[var(--c-s4)]";

/** 검색·필터 영역은 로딩 중에도 실제 버튼과 같은 폭을 예약한다. */
export function BomStageFilters({ value, onChange, includeRaw = false, disabled = false, label = "단계 필터" }: {
  value: "ALL" | StageLetter;
  onChange: (value: "ALL" | StageLetter) => void;
  includeRaw?: boolean;
  disabled?: boolean;
  label?: string;
}): ReactElement {
  const filters: { id: "ALL" | StageLetter; label: string }[] = [
    { id: "ALL", label: "전체" }, ...(includeRaw ? [{ id: "R" as const, label: "원자재" }] : []),
    { id: "A", label: "중간공정" }, { id: "F", label: "공정완료" },
  ];
  return <div role="group" aria-label={label} className="flex shrink-0 gap-1.5">
    {filters.map(filter => <button key={filter.id} type="button" disabled={disabled} onClick={() => onChange(filter.id)}
      aria-pressed={value === filter.id} className="whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold transition-colors"
      style={{ background: value === filter.id ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
        color: value === filter.id ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
        borderColor: value === filter.id ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}>{filter.label}</button>)}
  </div>;
}

/** 고정 프레임과 모서리 마스크는 스크롤 영역 크기에 영향을 주지 않는다. */
export function BomPanelFrame(): ReactElement {
  return <>
    <div data-scrollbar-rail-frame aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-2xl border" style={{ borderColor: LEGACY_COLORS.border }} />
    <div data-scrollbar-rail-masks aria-hidden className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
      <div className="flex justify-between">
        <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 15px, var(--c-bg) 16px)" }} />
        <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 15px, var(--c-bg) 16px)" }} />
      </div>
      <div className="flex justify-between">
        <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 15px, var(--c-bg) 16px)" }} />
        <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 0 0, transparent 0 15px, var(--c-bg) 16px)" }} />
      </div>
    </div>
  </>;
}

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

interface BomRowTooltipProps {
  itemName: string;
  children: (props: {
    nameRef: RefObject<HTMLSpanElement | null>;
    actionTooltipProps: Pick<DOMAttributes<HTMLElement>,
      "onMouseEnter" | "onMouseLeave" | "onMouseOverCapture" | "onMouseOutCapture" | "onFocusCapture" | "onBlurCapture">;
  }) => ReactNode;
}

export function BomRowTooltip({ itemName, children }: BomRowTooltipProps) {
  const nameRef = useRef<HTMLSpanElement>(null);
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
      disabled={isActionActive}
      shouldShow={() => !!nameRef.current && nameRef.current.scrollWidth > nameRef.current.clientWidth}
      multiline
      triggerClassName={`relative block min-w-0 w-full ${listPerformance.bomRow}`}
    >
      {children({ nameRef, actionTooltipProps })}
    </Tooltip>
  );
}

type HeaderVariant = "parent" | "whereused" | "candidate" | "current" | "usage";

const HEADER_COLUMNS: Record<HeaderVariant, readonly [string, string?][]> = {
  parent: [["공정"], ["품목명"], ["품목 코드"], ["상태", "justify-self-center"]],
  whereused: [["공정"], ["품목명"], ["품목 코드", "text-center"]],
  usage: [["공정"], ["품목명"], ["품목 코드", "text-center"], ["수량", "justify-self-center"]],
  candidate: [["공정"], ["품목명"], ["품목 코드"], ["추가", "justify-self-center"]],
  current: [["공정"], ["품목명"], ["품목 코드"], ["수량", "justify-self-center"], ["삭제", "justify-self-center"]],
};

interface BomTableHeaderProps {
  variant: HeaderVariant;
  gridTemplateColumns: string;
}

export function BomTableHeader({ variant, gridTemplateColumns }: BomTableHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10 grid h-9 shrink-0 items-center gap-2 px-3 text-xs font-bold uppercase tracking-[0.5px]"
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
  title?: string;
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
  title,
}: BomTableItemRowProps) {
  return (
    <BomRowTooltip itemName={item.item_name}>
      {({ nameRef }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={pressed}
      title={title}
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
