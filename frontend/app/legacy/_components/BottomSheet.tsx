"use client";

import { useEffect } from "react";
import { LEGACY_COLORS } from "./legacyUi";

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center backdrop-blur-md"
      style={{ background: "var(--c-overlay)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] overflow-y-auto rounded-t-[22px] border-t"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          maxHeight: "92vh",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 20px)",
          animation: "sheetUp .25s cubic-bezier(.32,1.2,.6,1)",
          boxShadow: "var(--c-elev-3), var(--c-inner-hl)",
        }}
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
            <div className="text-lg font-black">{title}</div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
