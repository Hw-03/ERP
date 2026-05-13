"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * Tooltip — `@/lib/ui/Tooltip`.
 *
 * 자체 React 툴팁. 브라우저 기본 `title` 툴팁의 대체.
 * - 마우스 호버 즉시 노출 (지연 0)
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
}

export function Tooltip({ content, children, side = "top", disabled = false, multiline = false }: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = !disabled && pos && content;

  const handleEnter = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const left = rect.left + rect.width / 2;
    const top = side === "top" ? rect.top - 6 : rect.bottom + 6;
    setPos({ left, top });
  };
  const handleLeave = () => setPos(null);

  return (
    <>
      <span
        ref={triggerRef}
        className="relative inline-flex"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </span>
      {show && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              className={`pointer-events-none fixed z-[100] -translate-x-1/2 rounded-[10px] border px-3 py-1.5 text-xs font-semibold shadow-lg ${
                multiline ? "whitespace-normal max-w-[220px] text-left" : "whitespace-nowrap"
              } ${side === "top" ? "-translate-y-full" : ""}`}
              style={{
                left: pos.left,
                top: pos.top,
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
