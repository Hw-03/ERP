"use client";

import { useEffect, useId } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

/**
 * BottomSheet — `@/lib/ui/BottomSheet` 정본.
 *
 * Round-14 (#1) feature boundary 정리: `features/mes/shared` 에서 `lib/ui` 로 이동.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const titleId = useId();
  const sheetRef = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "선택 시트"}
    >
      <div
        ref={sheetRef}
        className="w-full max-w-[430px] overflow-y-auto rounded-t-[22px] border-t"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          maxHeight: "92vh",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 20px)",
          animation: "sheetUp .25s cubic-bezier(.32,1.2,.6,1)",
        }}
        data-anim="sheetUp"
        onClick={(event) => event.stopPropagation()}
      >
        <style jsx>{`
          @keyframes sheetUp {
            from {
              transform: translateY(60px);
              opacity: 0;
            }
            to {
              transform: none;
              opacity: 1;
            }
          }
        `}</style>
        <div className="mx-auto my-3 h-1 w-[34px] rounded-full" style={{ background: LEGACY_COLORS.s3 }} />
        {title ? (
          <div className="mb-[14px] px-5">
            <div id={titleId} className="text-lg font-black">{title}</div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
