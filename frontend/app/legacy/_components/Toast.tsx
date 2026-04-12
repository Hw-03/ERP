"use client";

import { useEffect } from "react";

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
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const colors =
    toast.type === "success"
      ? "bg-emerald-600 text-white"
      : toast.type === "error"
        ? "bg-red-600 text-white"
        : "bg-slate-700 text-white";

  return (
    <div
      className={`fixed bottom-20 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-[390px] -translate-x-1/2 rounded-2xl px-5 py-3.5 text-sm font-medium shadow-2xl transition-all ${colors}`}
    >
      {toast.message}
    </div>
  );
}
