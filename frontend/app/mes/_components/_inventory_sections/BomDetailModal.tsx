"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { BomSubExpander } from "../_warehouse_v2/BomSubExpander";

type Props = {
  itemId: string;
  open: boolean;
  onClose: () => void;
};

export function BomDetailModal({ itemId, open, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(open, { initialFocusRef: closeRef });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        data-testid="bom-detail-modal-panel"
        className="flex w-[calc(100vw-128px)] max-h-[84vh] min-h-0 flex-col overflow-hidden rounded-[24px] border"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
          minHeight: "min(500px, 84vh)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: LEGACY_COLORS.border }}>
          <div>
            <div id={titleId} className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
              BOM 구성 보기
            </div>
            <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              읽기 전용 · 구성품별 현재 재고
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors hover:brightness-125"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <BomSubExpander itemId={itemId} open modal />
        </div>
      </div>
    </div>,
    document.body,
  );
}
