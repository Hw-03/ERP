"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";

/**
 * BottomSheet — `@/lib/ui/BottomSheet` 정본.
 *
 * Round-14 (#1) feature boundary 정리: `features/mes/shared` 에서 `lib/ui` 로 이동.
 * 모바일 개편: drag-to-dismiss(터치 핸들러 직접 구현, 의존성 0) 추가.
 *   - 핸들 바 또는 스크롤 최상단에서 아래로 끌면 시트가 따라 내려오고,
 *     임계 이동량/속도를 넘으면 onClose, 아니면 스냅백.
 *   - prefers-reduced-motion: 드래그 추적은 유지, 스냅백 트랜지션만 0ms.
 *   - 새 prop 미사용 시 기존 동작/시각과 완전 동일(후방호환).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  dismissThresholdPx = 96,
  dismissVelocity = 0.5,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** 이 픽셀 이상 끌어내리면 닫힘 (기본 96) */
  dismissThresholdPx?: number;
  /** 이 속도(px/ms) 이상으로 끌어내리면 닫힘 (기본 0.5) */
  dismissVelocity?: number;
  /** title 이 없을 때 dialog 접근명 (기본 "선택 시트") */
  ariaLabel?: string;
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

  // ── drag-to-dismiss 상태 ─────────────────────────────
  const [dragY, setDragY] = useState(0);
  const [snapping, setSnapping] = useState(false);
  // {시작Y, 시작시각, 핸들에서 시작?}; null 이면 비드래그
  const dragRef = useRef<{ y0: number; t0: number; fromHandle: boolean } | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reducedMotion = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // 시트가 닫히면 드래그 상태 리셋
  useEffect(() => {
    if (!open) {
      setDragY(0);
      setSnapping(false);
      dragRef.current = null;
    }
    return () => {
      if (snapTimer.current) clearTimeout(snapTimer.current);
    };
  }, [open]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const t = e.touches[0];
      const fromHandle =
        e.target instanceof Element && !!e.target.closest("[data-sheet-grabber]");
      // 핸들에서 시작했거나 콘텐츠가 최상단일 때만 드래그 후보
      if (!fromHandle && sheet.scrollTop > 0) {
        dragRef.current = null;
        return;
      }
      if (snapTimer.current) clearTimeout(snapTimer.current);
      setSnapping(false);
      dragRef.current = { y0: t.clientY, t0: performance.now(), fromHandle };
    },
    [sheetRef],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const drag = dragRef.current;
      const sheet = sheetRef.current;
      if (!drag || !sheet) return;
      const dy = e.touches[0].clientY - drag.y0;
      // 위로 끌거나(스크롤 의도) 콘텐츠 스크롤 중이면 드래그 취소 → 네이티브 스크롤 복귀
      if (dy <= 0 || (!drag.fromHandle && sheet.scrollTop > 0)) {
        if (dragY !== 0) setDragY(0);
        dragRef.current = null;
        return;
      }
      setDragY(dy);
    },
    [sheetRef, dragY],
  );

  const handleTouchEnd = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const elapsed = Math.max(1, performance.now() - drag.t0);
    const velocity = dragY / elapsed; // px/ms
    if (dragY > dismissThresholdPx || velocity > dismissVelocity) {
      onClose();
      return;
    }
    // 스냅백
    if (reducedMotion()) {
      setDragY(0);
      return;
    }
    setSnapping(true);
    setDragY(0);
    snapTimer.current = setTimeout(() => setSnapping(false), 220);
  }, [dragY, dismissThresholdPx, dismissVelocity, onClose, reducedMotion]);

  const onGrabberKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const sheetH = sheetRef.current?.offsetHeight ?? 1;
  const dimFactor = Math.max(0, Math.min(1, 1 - dragY / sheetH));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center"
      // zIndex 인라인 — 모달 스택은 Tailwind 스캔 여부와 무관히 항상 최상위.
      style={{ zIndex: 200, background: `rgba(0,0,0,${(0.6 * dimFactor).toFixed(3)})` }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel ?? "선택 시트"}
    >
      <div
        ref={sheetRef}
        className="w-full max-w-full overflow-y-auto rounded-t-[22px] border-t"
        style={{
          // 모달 시트는 불투명해야 함 — --c-s1 은 반투명이라 뒤 화면이 비친다.
          // 불투명 --c-bg 위에 s1 표면 틴트를 합성해 불투명 + 표면감 유지.
          backgroundColor: LEGACY_COLORS.bg,
          backgroundImage: `linear-gradient(${LEGACY_COLORS.s1}, ${LEGACY_COLORS.s1})`,
          borderColor: LEGACY_COLORS.border,
          maxHeight: "92vh",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 20px)",
          animation: dragY === 0 && !snapping ? "sheetUp .25s cubic-bezier(.32,1.2,.6,1)" : undefined,
          transform: dragY > 0 || snapping ? `translateY(${dragY}px)` : undefined,
          transition: snapping ? "transform .2s cubic-bezier(.32,1.2,.6,1)" : undefined,
          touchAction: "pan-y",
        }}
        data-anim="sheetUp"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
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
        <button
          type="button"
          data-sheet-grabber
          aria-label="시트 닫기 핸들"
          onClick={onClose}
          onKeyDown={onGrabberKeyDown}
          className="mx-auto my-3 block h-1 w-[34px] shrink-0 rounded-full"
          style={{ background: LEGACY_COLORS.s3, touchAction: "none" }}
        />
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
