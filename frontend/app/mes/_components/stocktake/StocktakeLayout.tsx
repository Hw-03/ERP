"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { MobileScrollFrame } from "../mobile/primitives/MobileScrollFrame";
import { SlidePanel } from "../common/SlidePanel";
import { DesktopRightPanel, DesktopPanelCloseButton } from "../DesktopRightPanel";
import { LEGACY_COLORS } from "@/lib/mes/color";

export type StocktakeVariant = "desktop" | "mobile";

type Props = {
  variant: StocktakeVariant;
  children: ReactNode;
  detail: ReactNode;
  detailOpen: boolean;
  onClose: () => void;
  footer?: ReactNode;
  detailKey?: string;
  detailTitle?: string;
  detailSubtitle?: string;
  detailBadge?: ReactNode;
  detailTone?: string;
};

/** Hide panes without unmounting their children so a count draft keeps its identity. */
export function StocktakeLayout({ variant, children, detail, detailOpen, onClose, footer, detailKey, detailTitle = "조사 작업", detailSubtitle, detailBadge, detailTone }: Props): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const detailBody = useRef<HTMLDivElement>(null);
  const listBody = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const wasOpen = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const mobile = variant === "mobile";
  const detailSurface = detailTone ? `color-mix(in srgb, ${detailTone} 7%, ${LEGACY_COLORS.s1})` : undefined;
  useEffect(() => {
    if (!detailOpen) return;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[role="dialog"][aria-modal="true"]')) closeRef.current();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [detailOpen]);
  useEffect(() => {
    if (!detailOpen) {
      if (wasOpen.current) {
        const viewport = listBody.current?.querySelector<HTMLElement>('[data-testid="mobile-scroll-viewport"], [data-testid="stocktake-list-viewport"]');
        if (viewport && mobile) viewport.scrollTop = listScroll.current;
        const focusTarget = root.current?.querySelector<HTMLButtonElement>('[data-stocktake-target][aria-pressed="true"]')
          ?? root.current?.querySelector<HTMLInputElement>('input[inputmode="search"]');
        focusTarget?.focus({ preventScroll: true });
      }
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    // The mobile sheet owns the actual viewport, rather than this inner body.
    const viewport = mobile ? detailBody.current?.parentElement : root.current?.querySelector<HTMLElement>('[data-testid="desktop-right-panel-body"]');
    if (viewport) viewport.scrollTop = 0;
    root.current?.querySelector<HTMLButtonElement>("[data-stocktake-close]")?.focus({ preventScroll: true });
  }, [detailOpen, mobile, detailKey]);

  return <div ref={root} className={`flex min-h-0 min-w-0 flex-1 ${mobile ? "flex-col" : "pr-4 [--stocktake-panel-width:320px] xl:[--stocktake-panel-width:436px]"}`}>
    <div ref={listBody} inert={mobile && detailOpen ? true : undefined} onScrollCapture={event => { if (!(mobile && detailOpen)) listScroll.current = (event.target as HTMLElement).scrollTop; }} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {mobile ? <MobileScrollFrame><div className="flex min-h-full flex-col gap-2">{children}</div></MobileScrollFrame> :
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div data-testid="stocktake-list-viewport" className="sg min-h-0 flex-1 overflow-x-hidden overflow-y-scroll [scrollbar-gutter:stable]">
            <div className="flex min-h-full flex-col gap-3 pb-4">{children}</div>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 right-2.5 z-30 h-6">
            <span className="absolute bottom-0 left-0 h-6 w-6" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 23px, var(--c-bg) 24px)" }} />
            <span className="absolute bottom-0 right-0 h-6 w-6" style={{ background: "radial-gradient(circle at 0 0, transparent 0 23px, var(--c-bg) 24px)" }} />
          </div>
        </div>}
      {footer}
    </div>
    {mobile ? <BottomSheet open={detailOpen} onClose={onClose} keepMounted ariaLabel="조사 작업" maxWidthClassName="max-w-[430px]"
      surfaceColor={detailSurface}>
      <div ref={detailBody} className="flex flex-col gap-3 px-4">{detail}</div>
    </BottomSheet> : <SlidePanel open={detailOpen} width="var(--stocktake-panel-width)" hideCloseButton modal={false} labelledBy="stocktake-work-title">
      <DesktopRightPanel fillAvailableWidth bodyScrollbarOutset surfaceColor={detailSurface} title={detailTitle} titleId="stocktake-work-title" subtitle={detailSubtitle} subtitleBadge={detailBadge}
        headerAction={<DesktopPanelCloseButton data-stocktake-close ariaLabel="작업 패널 닫기" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110" onClick={onClose} />}>
        <div className="flex min-h-full flex-col gap-4">{detail}</div>
      </DesktopRightPanel>
    </SlidePanel>}
  </div>;
}
