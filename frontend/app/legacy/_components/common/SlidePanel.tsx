"use client";

import { memo, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

interface Props {
  open: boolean;
  width?: number;
  onClose?: () => void;
  children: React.ReactNode;
}

/**
 * 우측 슬라이딩 패널 — width 애니메이션(160ms) + 콘텐츠 페이드+슬라이드(260ms).
 * open=false 일 때 width:0 으로 접힌다.
 * onClose 제공 시: X 버튼 표시 + ESC 키로 닫힘 + focus trap + aria.
 */
function SlidePanelImpl({ open, width = 436, onClose, children }: Props) {
  const panelRef = useFocusTrap<HTMLDivElement>(open && !!onClose);
  const titleId = "slide-panel-title";

  // ESC 닫기 (onClose 있을 때만)
  useEffect(() => {
    if (!open || !onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // aria props — onClose 없으면 일반 region
  const dialogProps = onClose
    ? { role: "dialog" as const, "aria-modal": true, "aria-labelledby": titleId }
    : {};

  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{
        width: open ? width : 0,
        transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        ref={panelRef}
        className="h-full pl-4"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateX(0)" : "translateX(18px)",
          transition: "opacity 260ms ease, transform 260ms ease",
          willChange: "transform, opacity",
        }}
        {...dialogProps}
      >
        {onClose && open && (
          <div className="flex justify-end pb-1 pt-0.5">
            <button
              type="button"
              onClick={onClose}
              aria-label="패널 닫기"
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:brightness-110"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 15%, transparent)`,
                color: LEGACY_COLORS.muted2,
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export const SlidePanel = memo(SlidePanelImpl);
