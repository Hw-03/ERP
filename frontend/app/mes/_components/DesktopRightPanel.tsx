"use client";

import { createContext, forwardRef, useContext, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui/TruncatedText";

const DesktopRightPanelBodyContext = createContext<HTMLDivElement | null>(null);
const DesktopRightPanelFooterContext = createContext<HTMLDivElement | null>(null);

type DesktopPanelCloseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "onClick" | "type"> & {
  onClick: () => void;
  ariaLabel?: string;
  iconClassName?: string;
};

export const DesktopPanelCloseButton = forwardRef<HTMLButtonElement, DesktopPanelCloseButtonProps>(
  function DesktopPanelCloseButton(
    {
      ariaLabel = "패널 닫기",
      className = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:brightness-110",
      iconClassName = "h-4 w-4",
      style = {
        background: `color-mix(in srgb, ${LEGACY_COLORS.red} 15%, transparent)`,
        color: LEGACY_COLORS.red,
      },
      ...props
    },
    ref,
  ) {
    return (
      <button ref={ref} type="button" aria-label={ariaLabel} className={className} style={style} {...props}>
        <X className={iconClassName} />
      </button>
    );
  },
);

export function useDesktopRightPanelBody(): HTMLDivElement | null {
  return useContext(DesktopRightPanelBodyContext);
}

export function DesktopRightPanelFooter({ children }: { children: ReactNode }) {
  const footer = useContext(DesktopRightPanelFooterContext);
  return footer ? createPortal(children, footer) : <>{children}</>;
}

export function DesktopRightPanel({
  title: titleText,
  titleId,
  subtitle,
  subtitleBadge,
  subtitleAction,
  subtitleFullWidth = false,
  headerBadge,
  backButton,
  headerAction,
  headerAlign = "start",
  topContent,
  onClose,
  fillAvailableWidth = false,
  tone = "default",
  surfaceColor,
  bodyScrollbarOutset = false,
  collapsibleHeader = false,
  scrollResetKey,
  children,
}: {
  title: string;
  titleId?: string;
  subtitle?: string;
  subtitleBadge?: React.ReactNode;
  subtitleAction?: ReactNode;
  /** 닫기 버튼 아래까지 부제 줄을 펼쳐 본문 오른쪽 끝선에 맞춘다. */
  subtitleFullWidth?: boolean;
  headerBadge?: React.ReactNode;
  backButton?: React.ReactNode;
  headerAction?: React.ReactNode;
  headerAlign?: "start" | "center";
  topContent?: ReactNode;
  onClose?: () => void;
  /** SlidePanel 내부의 사용 가능한 전체 폭을 사용할지 여부. */
  fillAvailableWidth?: boolean;
  tone?: "default" | "danger";
  /** Match a caller's status surface while preserving the default panel appearance. */
  surfaceColor?: string;
  bodyScrollbarOutset?: boolean;
  /** Let the header scroll away while the title remains visible. */
  collapsibleHeader?: boolean;
  scrollResetKey?: string;
  children: React.ReactNode;
}) {
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const titleBackdropRef = useRef<HTMLDivElement>(null);
  const metadataRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const edgeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const externalRail = collapsibleHeader && bodyScrollbarOutset;
  // Cross the 20px panel padding and 1px border, then add the standard 10px rail.
  // Matching right padding preserves the existing title and card widths.
  const scrollOutsetClass = externalRail ? "-mr-[31px] pr-[31px]" : bodyScrollbarOutset ? "-mr-2.5 pr-2.5" : "";

  useLayoutEffect(() => {
    if (collapsibleHeader && body) body.scrollTop = 0;
  }, [body, collapsibleHeader, scrollResetKey]);

  useLayoutEffect(() => {
    if (!collapsibleHeader || !body) return;
    // Decorations follow native scrolling without changing card or header heights.
    const updateOpacity = (): void => {
      const top = topRef.current;
      const metadata = metadataRef.current;
      const titleHeight = titleRef.current?.getBoundingClientRect().height ?? 0;
      if (top) top.style.opacity = String(Math.max(0, 1 - body.scrollTop / (top.offsetHeight || 1)));
      if (metadata) {
        const remaining = metadata.getBoundingClientRect().bottom - body.getBoundingClientRect().top - titleHeight;
        metadata.style.opacity = String(Math.max(0, Math.min(1, remaining / (metadata.offsetHeight || 1))));
      }
      const panel = panelRef.current;
      if (!panel) return;
      const panelRect = panel.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const titleRect = titleRef.current?.getBoundingClientRect();
      if (titleBackdropRef.current && titleRect) {
        titleBackdropRef.current.style.top = `${titleRect.top - panelRect.top - panel.clientTop}px`;
        titleBackdropRef.current.style.height = `${titleRect.height}px`;
      }
      const visibleTop = Math.max(bodyRect.top, titleRef.current?.getBoundingClientRect().bottom ?? bodyRect.top);
      const cards = Array.from(contentRef.current?.querySelectorAll<HTMLElement>("[data-panel-scroll-card]") ?? [])
        .map((element) => ({ element, rect: element.getBoundingClientRect() }));
      [visibleTop, bodyRect.bottom].forEach((boundary, index) => {
        const edge = edgeRefs.current[index];
        if (!edge) return;
        const card = cards.find(({ rect }) => rect.top < boundary && rect.bottom > boundary);
        edge.style.display = card ? "block" : "none";
        if (!card) return;
        const radius = Math.min(parseFloat(getComputedStyle(card.element).borderTopLeftRadius) || 0,
          (Math.min(card.rect.bottom, bodyRect.bottom) - Math.max(card.rect.top, visibleTop)) / 2);
        edge.style.left = `${card.rect.left - panelRect.left - panel.clientLeft}px`;
        edge.style.width = `${card.rect.width}px`;
        edge.style.top = `${boundary - panelRect.top - panel.clientTop - (index === 1 ? radius : 0)}px`;
        edge.style.height = `${radius}px`;
        edge.style.setProperty("--card-edge-radius", `${radius}px`);
        edge.style.borderRadius = index === 0 ? `${radius}px ${radius}px 0 0` : `0 0 ${radius}px ${radius}px`;
      });
    };
    updateOpacity();
    body.addEventListener("scroll", updateOpacity, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOpacity);
    [body, topRef.current, titleRef.current, metadataRef.current, contentRef.current].forEach((element) => {
      if (element) observer?.observe(element);
    });
    return () => {
      body.removeEventListener("scroll", updateOpacity);
      observer?.disconnect();
    };
  }, [body, collapsibleHeader, scrollResetKey]);

  const revealHeader = (): void => {
    if (body) body.scrollTop = 0;
    if (topRef.current) topRef.current.style.opacity = "1";
    if (metadataRef.current) metadataRef.current.style.opacity = "1";
  };
  const borderColor = tone === "danger"
    ? `color-mix(in srgb, ${LEGACY_COLORS.red} 24%, ${LEGACY_COLORS.border})`
    : LEGACY_COLORS.border;
  const metadata = subtitle || subtitleBadge || subtitleAction ? (
    <div className={`mt-1.5 flex items-center gap-2 text-sm leading-6 ${subtitleFullWidth ? "pr-1.5" : ""}`} style={{ color: LEGACY_COLORS.muted2 }}>
      {subtitleAction ? <>
        <div className="min-w-0 flex flex-wrap items-center gap-2 break-all">
          {subtitle ? <span>{subtitle}</span> : null}
          {subtitleBadge}
        </div>
        <div className="ml-auto shrink-0">{subtitleAction}</div>
      </> : <>
        {subtitle ? <span>{subtitle}</span> : null}
        {subtitleBadge}
      </>}
    </div>
  ) : null;
  const title = (
    <div className={`flex ${headerAlign === "center" ? "items-center" : "items-start"} gap-3`}>
      {backButton ? <div className="shrink-0 pt-0.5">{backButton}</div> : null}
      <div className={`min-w-0 flex-1 ${collapsibleHeader && onClose ? "pr-10" : "pr-1"}`}>
        <TruncatedText id={titleId} accessibilityLabel={titleText} className="line-clamp-2 text-[22px] font-black">{titleText}</TruncatedText>
        {!collapsibleHeader && !subtitleFullWidth && metadata}
      </div>
      {headerBadge ? <div className="shrink-0 pt-1">{headerBadge}</div> : null}
      {headerAction ?? (!collapsibleHeader && onClose && <DesktopPanelCloseButton onClick={onClose} />)}
    </div>
  );

  return (
    <DesktopRightPanelBodyContext.Provider value={body}>
      <DesktopRightPanelFooterContext.Provider value={footer}>
        <div
          ref={panelRef}
          data-testid="desktop-right-panel"
          className={`${collapsibleHeader ? "relative " : ""}flex h-full min-h-0 ${fillAvailableWidth ? "w-full" : "w-[420px]"} shrink-0 flex-col ${externalRail ? "overflow-visible" : "overflow-hidden"} rounded-[32px] border px-5 py-5`}
          style={{
            background: surfaceColor ?? LEGACY_COLORS.s1,
            borderColor: tone === "danger"
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 32%, ${LEGACY_COLORS.border})`
              : LEGACY_COLORS.border,
          }}
        >
          {!collapsibleHeader && <>
            {topContent}
            <div
              data-testid="desktop-right-panel-header"
              className="mb-4 px-1 pb-4 border-b"
              style={{ background: "transparent", borderColor }}
            >
              {title}
              {subtitleFullWidth && metadata}
            </div>
          </>}
          {collapsibleHeader && onClose && <div className="absolute right-5 top-[30px] z-30"><DesktopPanelCloseButton onClick={onClose} /></div>}
          <div ref={setBody} data-testid="desktop-right-panel-body" className={`sg ${collapsibleHeader ? "relative " : ""}min-h-0 flex-1 overflow-y-auto ${scrollOutsetClass}`}>
            {collapsibleHeader && <>
              <div ref={topRef} onFocusCapture={revealHeader} className="flow-root">{topContent}</div>
              <div
                ref={titleRef}
                data-testid="desktop-right-panel-sticky-title"
                className="sticky top-0 z-20 px-1"
                style={{ background: `linear-gradient(${surfaceColor ?? LEGACY_COLORS.s1}, ${surfaceColor ?? LEGACY_COLORS.s1}), ${LEGACY_COLORS.bg}` }}
              >
                {title}
              </div>
              <div ref={metadataRef} onFocusCapture={revealHeader} data-testid="desktop-right-panel-header" className="mb-4 border-b px-1 pb-4" style={{ borderColor }}>{metadata}</div>
            </>}
            {collapsibleHeader ? <div ref={contentRef}>{children}</div> : children}
          </div>
          {collapsibleHeader && <div data-testid="desktop-panel-surface-clip" aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[31px]">
            <div ref={titleBackdropRef} data-testid="desktop-panel-title-backdrop" aria-hidden="true"
            className="pointer-events-none absolute inset-x-px z-10"
            style={{ height: 0, background: `linear-gradient(${surfaceColor ?? LEGACY_COLORS.s1}, ${surfaceColor ?? LEGACY_COLORS.s1}), ${LEGACY_COLORS.bg}` }} />
          {(["top", "bottom"] as const).map((edge, index) => (
            <div key={edge} ref={(element) => { edgeRefs.current[index] = element; }}
              data-testid={`desktop-panel-card-edge-${edge}`} aria-hidden="true"
              className="pointer-events-none absolute z-20" style={{ display: "none", borderColor: LEGACY_COLORS.border }}>
              <div className={`absolute inset-0 border [border-radius:inherit] ${edge === "top" ? "border-b-0" : "border-t-0"}`} style={{ borderColor: "inherit" }} />
              {["left", "right"].map((side) => <span key={side} className={`absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"}`} style={{
                width: "var(--card-edge-radius)",
                background: `linear-gradient(${surfaceColor ?? LEGACY_COLORS.s1}, ${surfaceColor ?? LEGACY_COLORS.s1}), ${LEGACY_COLORS.bg}`,
                maskImage: `radial-gradient(circle at ${side === "left" ? "100%" : "0"} ${edge === "top" ? "100%" : "0"}, transparent 0 calc(var(--card-edge-radius) - 1px), black var(--card-edge-radius))`,
              }} />)}
            </div>
          ))}
          </div>}
          <div ref={setFooter} data-testid="desktop-right-panel-footer" className="max-h-[45%] shrink-0 overflow-y-auto empty:hidden pt-4" />
        </div>
      </DesktopRightPanelFooterContext.Provider>
    </DesktopRightPanelBodyContext.Provider>
  );
}
