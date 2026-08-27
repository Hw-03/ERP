"use client";

import { createContext, forwardRef, useContext, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
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
  title,
  titleId,
  subtitle,
  subtitleBadge,
  headerBadge,
  backButton,
  topContent,
  onClose,
  fillAvailableWidth = false,
  children,
}: {
  title: string;
  titleId?: string;
  subtitle?: string;
  subtitleBadge?: React.ReactNode;
  headerBadge?: React.ReactNode;
  backButton?: React.ReactNode;
  topContent?: ReactNode;
  onClose?: () => void;
  /** SlidePanel 내부의 사용 가능한 전체 폭을 사용할지 여부. */
  fillAvailableWidth?: boolean;
  children: React.ReactNode;
}) {
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);

  return (
    <DesktopRightPanelBodyContext.Provider value={body}>
      <DesktopRightPanelFooterContext.Provider value={footer}>
        <div
          className={`flex h-full min-h-0 ${fillAvailableWidth ? "w-full" : "w-[420px]"} shrink-0 flex-col overflow-hidden rounded-[32px] border px-5 py-5`}
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {topContent}
          <div className="mb-4 px-1 pb-4 border-b" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="flex items-start gap-3">
              {backButton ? <div className="shrink-0 pt-0.5">{backButton}</div> : null}
              <div className="min-w-0 flex-1 pr-1">
                <TruncatedText
                  id={titleId}
                  accessibilityLabel={title}
                  className="line-clamp-2 text-[22px] font-black"
                >
                  {title}
                </TruncatedText>
                {subtitle || subtitleBadge ? (
                  <div className="mt-1.5 flex items-center gap-2 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                    {subtitle ? <span>{subtitle}</span> : null}
                    {subtitleBadge}
                  </div>
                ) : null}
              </div>
              {headerBadge ? <div className="shrink-0 pt-1">{headerBadge}</div> : null}
              {onClose && <DesktopPanelCloseButton onClick={onClose} />}
            </div>
          </div>
          <div ref={setBody} data-testid="desktop-right-panel-body" className="sg min-h-0 flex-1 overflow-y-auto">{children}</div>
          <div ref={setFooter} data-testid="desktop-right-panel-footer" className="max-h-[45%] shrink-0 overflow-y-auto empty:hidden pt-4" />
        </div>
      </DesktopRightPanelFooterContext.Provider>
    </DesktopRightPanelBodyContext.Provider>
  );
}
