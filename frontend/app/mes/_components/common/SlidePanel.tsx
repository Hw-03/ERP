"use client";

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

interface Props {
  open: boolean;
  width?: number;
  onClose?: () => void;
  /** true 면 X 버튼을 렌더하지 않음 (카드 내부에서 직접 닫기 버튼을 제공할 때). ESC 처리는 유지. */
  hideCloseButton?: boolean;
  /** false면 목록과 나란히 탐색 가능한 complementary 영역으로 렌더한다. */
  modal?: boolean;
  /** 패널 제목 요소의 id. */
  labelledBy?: string;
  children: React.ReactNode;
}

/**
 * 우측 슬라이딩 패널 — width 애니메이션(160ms) + 콘텐츠 페이드+슬라이드(260ms).
 * open=false 일 때 width:0 으로 접힌다.
 * onClose 제공 시 X 버튼과 ESC 닫기를 제공한다. modal=true(기본)에서만 focus trap을 적용한다.
 */
function SlidePanelImpl({
  open,
  width = 436,
  onClose,
  hideCloseButton,
  modal = true,
  labelledBy,
  children,
}: Props) {
  const panelRef = useFocusTrap<HTMLDivElement>(open && !!onClose && modal);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    wrapperRef.current?.toggleAttribute("inert", !open);
  }, [open]);

  // ESC 닫기 (onClose 있을 때만)
  useEffect(() => {
    if (!open || !onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const panelProps = modal
    ? onClose
      ? { role: "dialog" as const, "aria-modal": true, "aria-labelledby": labelledBy }
      : { "aria-labelledby": labelledBy }
    : { role: "complementary" as const, "aria-labelledby": labelledBy };

  return (
    <div
      ref={wrapperRef}
      aria-hidden={open ? undefined : true}
      className="shrink-0 overflow-hidden"
      style={{
        width: open ? width : 0,
        transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        ref={panelRef}
        className="relative flex h-full min-h-0 flex-col pl-4"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateX(0)" : "translateX(18px)",
          transition: "opacity 260ms ease, transform 260ms ease",
          willChange: "transform, opacity",
        }}
        {...panelProps}
      >
        {/* 닫기 ✕ — 콘텐츠 우상단 모서리에 겹침. hideCloseButton=true 면 카드 내부 버튼이 대신함. */}
        {!hideCloseButton && onClose && open && (
          <button
            type="button"
            onClick={onClose}
            aria-label="패널 닫기"
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:brightness-110"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 15%, transparent)`,
              color: LEGACY_COLORS.muted2,
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

export const SlidePanel = memo(SlidePanelImpl);
