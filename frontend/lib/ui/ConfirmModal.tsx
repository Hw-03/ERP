"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

/**
 * ConfirmModal — `@/lib/ui/ConfirmModal` 정본.
 *
 * Round-14 (#1) feature boundary 정리: `features/mes/shared` 에서 `lib/ui` 로 이동.
 */
export type ConfirmTone = "normal" | "caution" | "danger";

const TONE_ACCENT: Record<ConfirmTone, string> = {
  normal: LEGACY_COLORS.blue,
  caution: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
};

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  tone?: ConfirmTone;
  cautionMessage?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  confirmAccent?: string;
}

export function ConfirmModal({
  open,
  title,
  onClose,
  onConfirm,
  tone = "normal",
  cautionMessage,
  children,
  confirmLabel = "확인",
  cancelLabel = "취소",
  busy = false,
  busyLabel = "처리 중...",
  confirmAccent,
}: Props) {
  // ESC 닫기 / Enter 확인 — busy 중에는 잠금
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Enter") {
        const target = e.target as HTMLElement | null;
        // 다행 텍스트는 Enter 가 줄바꿈
        if (target?.tagName === "TEXTAREA") return;
        if (target instanceof HTMLElement && target.isContentEditable) return;
        // 한글 IME 조합 중 Enter 는 자모 확정 신호 — 무시
        if (e.isComposing) return;
        e.preventDefault();
        void onConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy, onClose, onConfirm]);

  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // backdrop 직접 mousedown 추적 — input 안에서 드래그 시작해 backdrop 위에서 mouseup 한 경우 닫지 않게 함.
  const downOnBackdropRef = useRef(false);

  if (!open || !mounted) return null;

  const toneAccent = TONE_ACCENT[tone];
  const accent = confirmAccent ?? toneAccent;
  const isCautionLike = tone === "caution" || tone === "danger";

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onMouseDown={(e) => {
        downOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const downOnBackdrop = downOnBackdropRef.current;
        downOnBackdropRef.current = false;
        if (busy) return;
        if (e.target === e.currentTarget && downOnBackdrop) onClose();
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
          borderColor: isCautionLike
            ? `color-mix(in srgb, ${toneAccent} 50%, transparent)`
            : LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          {isCautionLike && <AlertTriangle className="h-5 w-5" style={{ color: toneAccent }} />}
          <div id={titleId} className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
            {title}
          </div>
        </div>

        {cautionMessage && (
          <div
            className="mb-4 rounded-[12px] border px-3 py-2 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${toneAccent} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${toneAccent} 40%, transparent)`,
              color: toneAccent,
            }}
          >
            {cautionMessage}
          </div>
        )}

        {children}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors hover:brightness-125 disabled:opacity-50"
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
              background: LEGACY_COLORS.s2,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
            style={{ background: accent }}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
