"use client";

import { useEffect } from "react";
import { LEGACY_COLORS, LEGACY_SHADOWS } from "./legacyUi";

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
      className="fixed inset-0 z-[200] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t"
        style={{
          background: "rgba(16,18,26,0.97)",
          borderColor: "rgba(255,255,255,.1)",
          maxHeight: "92vh",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 20px)",
          animation: "sheetUp .25s cubic-bezier(.32,1.2,.6,1)",
          boxShadow: LEGACY_SHADOWS.lg,
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
        <div className="mx-auto my-4 h-1 w-10 rounded-full" style={{ background: LEGACY_COLORS.muted }} />
        {title ? (
          <div className="mb-5 px-5">
            <div className="text-lg font-black">{title}</div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
