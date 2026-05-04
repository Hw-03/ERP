"use client";

import { memo } from "react";

interface Props {
  open: boolean;
  width?: number;
  children: React.ReactNode;
}

/**
 * 우측 슬라이딩 패널 — width 애니메이션(160ms) + 콘텐츠 페이드+슬라이드(260ms).
 * open=false 일 때 width:0 으로 접힌다.
 */
function SlidePanelImpl({ open, width = 436, children }: Props) {
  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: open ? width : 0,
        transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        className="h-full pl-4"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateX(0)" : "translateX(18px)",
          transition: "opacity 260ms ease, transform 260ms ease",
          willChange: "transform, opacity",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export const SlidePanel = memo(SlidePanelImpl);
