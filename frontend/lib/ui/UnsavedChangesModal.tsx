"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import type { UnsavedChangesModalProps } from "./useUnsavedChangesGuard";

/**
 * UnsavedChangesModal — PR-2 2-3.
 *
 * 2버튼: "저장하고 이동" / "저장하지 않고 이동".
 * ESC / 배경 클릭 = 취소 (이동 안 함).
 */
export function UnsavedChangesModal({
  open,
  busy,
  onSaveAndProceed,
  onProceedWithoutSave,
  onCancel,
}: UnsavedChangesModalProps) {
  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy, onCancel]);

  if (!open || !mounted) return null;

  const toneAccent = LEGACY_COLORS.yellow;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={() => {
        if (!busy) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[520px] rounded-[24px] border p-6"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${toneAccent} 50%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" style={{ color: toneAccent }} />
          <div
            id={titleId}
            className="text-lg font-black"
            style={{ color: LEGACY_COLORS.text }}
          >
            저장하지 않은 변경 사항이 있습니다.
          </div>
        </div>

        <div
          className="mb-4 rounded-[12px] border px-3 py-2 text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${toneAccent} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${toneAccent} 40%, transparent)`,
            color: toneAccent,
          }}
        >
          저장하지 않고 이동하면 입력 내용이 사라집니다.
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onProceedWithoutSave}
            disabled={busy}
            className="rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors hover:brightness-125 disabled:opacity-50"
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
              background: LEGACY_COLORS.s2,
            }}
          >
            저장하지 않고 이동
          </button>
          <button
            type="button"
            onClick={onSaveAndProceed}
            disabled={busy}
            className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
            style={{ background: LEGACY_COLORS.blue }}
          >
            {busy ? "저장 중..." : "저장하고 이동"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
