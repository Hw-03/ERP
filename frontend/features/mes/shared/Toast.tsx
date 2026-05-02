"use client";

import { useEffect } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * Toast — `@/features/mes/shared/Toast` 정본.
 *
 * Round-5 (R5-9) 본문 이전. 기존 `app/legacy/_components/Toast.tsx` 는
 * 본 파일로부터 re-export 하는 thin wrapper 로 변환된다.
 *
 * 호출처 변경 0 — 기존 import 경로 그대로 사용 가능.
 */
export interface ToastState {
  message: string;
  type: "success" | "error" | "info";
}

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 2800);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const borderColor =
    toast.type === "success"
      ? LEGACY_COLORS.green
      : toast.type === "error"
        ? LEGACY_COLORS.red
        : LEGACY_COLORS.blue;

  return (
    <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,16px)+54px)] z-[500] w-[calc(100%-28px)] max-w-[402px] -translate-x-1/2">
      <div
        role={toast.type === "error" ? "alert" : "status"}
        aria-live={toast.type === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        className="rounded-xl border px-[14px] py-[10px] text-xs font-semibold"
        style={{
          background: LEGACY_COLORS.s3,
          borderColor: LEGACY_COLORS.border,
          borderLeftWidth: 3,
          borderLeftColor: borderColor,
          color: LEGACY_COLORS.text,
        }}
      >
        {toast.message}
      </div>
    </div>
  );
}
