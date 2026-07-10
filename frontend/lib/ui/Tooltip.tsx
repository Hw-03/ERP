"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LEGACY_COLORS } from "@/lib/mes/color";

function addDescription(element: HTMLElement, descriptionId: string) {
  const ids = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  if (!ids.includes(descriptionId)) element.setAttribute("aria-describedby", [...ids, descriptionId].join(" "));
}

function removeDescription(element: HTMLElement, descriptionId: string) {
  const ids = (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((id) => id && id !== descriptionId);
  if (ids.length > 0) element.setAttribute("aria-describedby", ids.join(" "));
  else element.removeAttribute("aria-describedby");
}

/**
 * Tooltip — `@/lib/ui/Tooltip`.
 *
 * 자체 React 툴팁. 브라우저 기본 `title` 툴팁의 대체.
 * - 마우스 호버 즉시 노출 (지연 0)
 * - trigger 또는 내부 컨트롤의 키보드 focus에도 노출
 * - LEGACY_COLORS 톤
 * - `pointer-events-none` 으로 자체가 호버를 가로채지 않음
 * - disabled 버튼 위에서도 동작 (wrapper span 이 이벤트 받음)
 * - **document.body 포털 + position:fixed** — 부모의 overflow/transform 영향 무시,
 *   테이블 셀 안에서도 잘리지 않고 최상단에 노출.
 */

interface Props {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /** true 면 툴팁 표시 자체를 끔. content 가 비어도 자동으로 안 뜸. */
  disabled?: boolean;
  /** true 면 multi-line content 허용 (whitespace-normal + max-width). 기본 false (한 줄 nowrap). */
  multiline?: boolean;
  /**
   * trigger wrapper span 의 className 을 override.
   * 기본 "relative inline-flex" — `min-w-0` 부모 안에서 truncate 자식을 감쌀 땐
   * `"relative block min-w-0 w-full"` 같이 block 계열로 바꿔야 truncate 가 깨지지 않음.
   */
  triggerClassName?: string;
  triggerId?: string;
  triggerTabIndex?: number;
  triggerAriaLabel?: string;
}

export function Tooltip({
  content,
  children,
  side = "top",
  disabled = false,
  multiline = false,
  triggerClassName = "relative inline-flex",
  triggerId,
  triggerTabIndex,
  triggerAriaLabel,
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const focusedTargetRef = useRef<HTMLElement | null>(null);
  const tooltipId = useId();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [describesFocusedChild, setDescribesFocusedChild] = useState(false);
  const show = !disabled && pos !== null && Boolean(content);

  useEffect(() => () => {
    if (focusedTargetRef.current) removeDescription(focusedTargetRef.current, tooltipId);
  }, [tooltipId]);

  const clearFocusedDescription = () => {
    if (focusedTargetRef.current) removeDescription(focusedTargetRef.current, tooltipId);
    focusedTargetRef.current = null;
    setDescribesFocusedChild(false);
  };

  const handleShow = () => {
    if (disabled) return;
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const left = rect.left + rect.width / 2;
    const top = side === "top" ? rect.top - 6 : rect.bottom + 6;
    setPos({ left, top });
  };
  const handleMouseLeave = () => {
    if (triggerRef.current?.contains(document.activeElement)) return;
    clearFocusedDescription();
    setPos(null);
  };
  const handleFocus = (event: FocusEvent<HTMLSpanElement>) => {
    if (disabled || !Boolean(content)) return;
    const target = event.target instanceof HTMLElement ? event.target : event.currentTarget;
    if (focusedTargetRef.current && focusedTargetRef.current !== target) {
      removeDescription(focusedTargetRef.current, tooltipId);
    }
    if (target === event.currentTarget) {
      focusedTargetRef.current = null;
      setDescribesFocusedChild(false);
    } else {
      addDescription(target, tooltipId);
      focusedTargetRef.current = target;
      setDescribesFocusedChild(true);
    }
    handleShow();
  };
  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    clearFocusedDescription();
    setPos(null);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Escape" || !show) return;
    event.preventDefault();
    event.stopPropagation();
    clearFocusedDescription();
    setPos(null);
  };

  return (
    <>
      <span
        ref={triggerRef}
        id={triggerId}
        tabIndex={triggerTabIndex}
        aria-label={triggerAriaLabel}
        aria-describedby={show && !describesFocusedChild ? tooltipId : undefined}
        className={triggerClassName}
        onMouseEnter={handleShow}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {children}
      </span>
      {show && typeof document !== "undefined"
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              className={`pointer-events-none fixed z-[600] -translate-x-1/2 rounded-[10px] border px-3 py-1.5 text-xs font-semibold shadow-lg ${
                multiline ? "whitespace-normal text-left" : "whitespace-nowrap"
              } ${side === "top" ? "-translate-y-full" : ""}`}
              style={{
                left: pos.left,
                top: pos.top,
                maxWidth: multiline ? "min(220px, calc(100vw - 24px))" : undefined,
                overflowWrap: multiline ? "anywhere" : undefined,
                background: LEGACY_COLORS.s1,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
