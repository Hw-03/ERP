"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { sendClientEvent } from "@/lib/client-events";

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
  onConfirm?: () => void | Promise<void>;
  /** 읽기 전용 팝업: backdrop 닫기를 켜고 확인 액션을 숨긴다. */
  viewer?: boolean;
  /** 안내 확인 전용 팝업: 취소·Escape 닫기를 막고 확인 액션만 노출한다. */
  acknowledgeOnly?: boolean;
  /** 긴 안내 제목과 비교 콘텐츠를 한 줄 폭으로 보여준다. */
  wide?: boolean;
  tone?: ConfirmTone;
  cautionMessage?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  confirmAccent?: string;
  confirmDisabled?: boolean;
  auditAction?: { key: string; label: string };
}

export function ConfirmModal({
  open,
  title,
  onClose,
  onConfirm,
  viewer = false,
  acknowledgeOnly = false,
  wide = false,
  tone = "normal",
  cautionMessage,
  children,
  confirmLabel = "확인",
  cancelLabel = "취소",
  busy = false,
  busyLabel = "처리 중...",
  confirmAccent,
  confirmDisabled = false,
  auditAction,
}: Props) {
  const closeWithAudit = useCallback(() => {
    if (!viewer) {
      const action = auditAction ?? { key: "confirm.cancel", label: title };
      sendClientEvent({
        event: "ui_action_cancel",
        action_key: action.key,
        action_label: action.label,
      });
    }
    onClose();
  }, [auditAction, onClose, title, viewer]);

  // ESC 닫기 / Enter 확인 — busy 중에는 잠금
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "Escape") {
        if (acknowledgeOnly) return;
        if (viewer) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        closeWithAudit();
        return;
      }
      if (e.key === "Enter" && onConfirm) {
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
    window.addEventListener("keydown", handler, viewer);
    return () => window.removeEventListener("keydown", handler, viewer);
  }, [open, busy, onConfirm, viewer, acknowledgeOnly, closeWithAudit]);

  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(open, {
    initialFocusRef: viewer ? closeRef : undefined,
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const toneAccent = TONE_ACCENT[tone];
  const accent = confirmAccent ?? toneAccent;
  const isCautionLike = tone === "caution" || tone === "danger";

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={viewer ? closeWithAudit : undefined}
    >
      <div
        ref={panelRef}
        className={`w-full rounded-[24px] border p-6 ${wide ? "max-w-[640px]" : "max-w-[520px]"}`}
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
          {!acknowledgeOnly && (
            <button
              ref={closeRef}
              type="button"
              onClick={closeWithAudit}
              disabled={busy}
              className="standard-hover rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
              style={{
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.muted2,
                background: LEGACY_COLORS.s2,
              }}
            >
              {cancelLabel}
            </button>
          )}
          {!viewer && onConfirm && (
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={busy || confirmDisabled}
              className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
              style={{ background: accent }}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
