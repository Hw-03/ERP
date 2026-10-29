"use client";

import { useContext, useEffect, useId, useRef, useState, type ElementType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import presentation from "../mobile/mobilePresentation.module.css";
import { MOBILE_MODAL_VIEWPORT_STYLE } from "../mobile/mobileModalLayout";
import { WorkspaceInteractionContext } from "../login/WorkspaceInteractionContext";

const openDialogs: { dialog: HTMLDivElement; previouslyFocused: HTMLElement | null }[] = [];
let previousBodyOverflow = "";
const FOCUSABLE_SELECTORS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface PopupDialogFrameProps {
  title: string;
  icon: ElementType;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  mobilePresentation?: boolean;
  closeLabel?: string;
}

/** Keep notification and memo popups on the same accessible desktop/mobile frame. */
export function PopupDialogFrame({ title, icon: Icon, subtitle, onClose, children, mobilePresentation = false, closeLabel = `${title} 닫기` }: PopupDialogFrameProps): ReactNode {
  const interactive = useContext(WorkspaceInteractionContext);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !dialog || !interactive) return;
    const entry = { dialog, previouslyFocused: document.activeElement as HTMLElement | null };
    if (openDialogs.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogs.push(entry);
    const isTopDialog = (): boolean => openDialogs[openDialogs.length - 1] === entry;
    const restoreDialogFocus = (): void => {
      if (isTopDialog() && !dialog.contains(document.activeElement)) closeRef.current?.focus();
    };
    closeRef.current?.focus();
    const handleKey = (event: globalThis.KeyboardEvent): void => {
      if (!isTopDialog()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
          .filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0 && element.offsetParent !== null);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (first && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey, true);
    document.addEventListener("focusin", restoreDialogFocus);
    // Children can finish loading or remove the focused row without rerendering this frame.
    const observer = new MutationObserver(restoreDialogFocus);
    observer.observe(dialog, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("focusin", restoreDialogFocus);
      observer.disconnect();
      const wasTopDialog = isTopDialog();
      const index = openDialogs.indexOf(entry);
      const nextEntry = openDialogs[index + 1];
      // If an underlying frame closes first, preserve its original focus destination.
      if (nextEntry?.previouslyFocused && dialog.contains(nextEntry.previouslyFocused)) nextEntry.previouslyFocused = entry.previouslyFocused;
      openDialogs.splice(index, 1);
      const remainingDialog = openDialogs[openDialogs.length - 1]?.dialog;
      if (!remainingDialog) document.body.style.overflow = previousBodyOverflow;
      const previouslyFocused = entry.previouslyFocused;
      if (wasTopDialog && previouslyFocused && document.contains(previouslyFocused) && !previouslyFocused.closest("[inert]")
        && (!remainingDialog || remainingDialog.contains(previouslyFocused))) previouslyFocused.focus();
    };
  }, [mounted, interactive]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (interactive && dialog && openDialogs[openDialogs.length - 1]?.dialog === dialog && !dialog.contains(document.activeElement)) closeRef.current?.focus();
  });

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[260] flex items-center justify-center ${mobilePresentation ? `px-4 ${presentation.scope}` : "p-4 sm:p-6"}`}
      style={{ background: "rgba(0,0,0,.45)", ...(mobilePresentation ? MOBILE_MODAL_VIEWPORT_STYLE : {}), display: interactive ? undefined : "none" }}
      aria-hidden={!interactive || undefined}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`flex w-full min-h-0 flex-col overflow-hidden rounded-[24px] border shadow-lg ${mobilePresentation ? "h-full max-w-[398px] md:max-w-[688px]" : "max-w-[640px]"}`}
        style={{
          maxHeight: mobilePresentation ? undefined : "min(720px, calc(100dvh - 48px))",
          background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-popup-shadow)",
        }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ color: LEGACY_COLORS.blue, background: tint(LEGACY_COLORS.blue, 12) }} aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
          {mobilePresentation ? <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold" style={{ color: LEGACY_COLORS.text }}>{title}</h2>
            {subtitle != null && <p className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{subtitle}</p>}
          </div> : <>
            <h2 id={titleId} className="min-w-0 flex-1 text-xl font-bold" style={{ color: LEGACY_COLORS.text }}>{title}</h2>
            {subtitle != null && <p className="text-right text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{subtitle}</p>}
          </>}
          <button ref={closeRef} type="button" onClick={onClose} aria-label={closeLabel}
            className="no-btn-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2"
            style={{ color: LEGACY_COLORS.muted2 }}><X className="h-5 w-5" /></button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
