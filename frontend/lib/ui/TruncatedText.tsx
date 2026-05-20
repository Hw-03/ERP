"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";

/**
 * TruncatedText — `@/lib/ui/TruncatedText`.
 *
 * Tailwind `truncate` 로 끝이 `…` 처리된 텍스트에 즉시(0ms) hover 툴팁 표시.
 * 실제로 잘렸을 때(`scrollWidth > clientWidth`)만 툴팁 노출 — 짧은 텍스트엔 노이즈 없음.
 *
 * 사용:
 *   <TruncatedText className="truncate text-sm font-semibold" style={{ color }}>
 *     {item_name}
 *   </TruncatedText>
 *
 * suffix 가 붙는 composite 케이스(예: `{erp_code} · 자식 N개`)에서 풀텍스트를 따로
 * 보여주고 싶으면 `tooltipContent` 로 override.
 */
interface Props {
  className?: string;
  style?: CSSProperties;
  /** 화면에 표시되는 내용 (truncate 됨). 단순 문자열 또는 ReactNode. */
  children: ReactNode;
  /** 툴팁에 표시할 내용 override. 기본 = children. */
  tooltipContent?: ReactNode;
  /** 기본 true — BOM 품목명은 길어 nowrap 시 화면 밖으로 나감. */
  multiline?: boolean;
  side?: "top" | "bottom";
}

export function TruncatedText({
  className,
  style,
  children,
  tooltipContent,
  multiline = true,
  side = "top",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setIsOverflow(el.scrollWidth > el.clientWidth);
    };
    check();
    // ResizeObserver — 부모 폭 변경/창 리사이즈 시 재측정.
    // jsdom 미지원 환경에서는 try/catch 로 안전 폴백.
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(check);
      ro.observe(el);
    } catch {
      // 폴백: 윈도 리사이즈만이라도 잡음
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }
    return () => {
      ro?.disconnect();
    };
  }, []);

  return (
    <Tooltip
      content={tooltipContent ?? children}
      disabled={!isOverflow}
      multiline={multiline}
      side={side}
      triggerClassName="relative block min-w-0 w-full"
    >
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    </Tooltip>
  );
}
