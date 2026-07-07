"use client";

import { useState } from "react";
import clsx from "clsx";

/**
 * 모바일에서 긴 품목명을 탭하면 전체로 펼쳐 보여주는 이름 표시(항목 4-7A).
 *
 * - 모바일: 탭 토글 — 펼치면 줄바꿈으로 전체 표시, 접으면 1줄 truncate.
 * - 데스크톱(lg): 탭 비활성(`pointer-events-none`) + 항상 1줄 truncate + `title` 툴팁
 *   → 기존 hover 동작 그대로라 PC 무변경.
 *
 * 상위가 클릭 가능한 카드/행이면 `stopPropagation` 으로 이름 토글이 상위 클릭과 섞이지 않게 한다.
 * 전역 `button` inset 테두리는 `no-btn-inset` 으로 끈다.
 */
export function ExpandableItemName({
  name,
  className,
  collapsedClassName = "truncate",
  expandedClassName = "whitespace-normal break-words",
  style,
}: {
  name: string;
  className?: string;
  collapsedClassName?: string;
  expandedClassName?: string;
  style?: React.CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      title={name}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      className={clsx(
        className,
        "no-btn-inset min-w-0 max-w-full text-left",
        expanded ? expandedClassName : collapsedClassName,
        "lg:pointer-events-none lg:truncate",
      )}
    >
      {name}
    </button>
  );
}
