"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export type StatusTargetNoticeTone = "success" | "error" | "info";

export type StatusTargetNotice = {
  id: number;
  message: string;
  tone?: StatusTargetNoticeTone;
};

interface StatusTargetNoticeController {
  notice: StatusTargetNotice | null;
  showNotice: (message: string, tone?: StatusTargetNoticeTone) => void;
  dismissNotice: (noticeId: number) => void;
}

/** 같은 화면에서 연속 호출해도 애니메이션을 다시 시작하도록 알림 ID를 관리한다. */
export function useStatusTargetNotice(): StatusTargetNoticeController {
  const [notice, setNotice] = useState<StatusTargetNotice | null>(null);
  const nextIdRef = useRef(0);

  const showNotice = useCallback((message: string, tone: StatusTargetNoticeTone = "info") => {
    nextIdRef.current += 1;
    setNotice({ id: nextIdRef.current, message, tone });
  }, []);

  const dismissNotice = useCallback((noticeId: number) => {
    setNotice((current) => current?.id === noticeId ? null : current);
  }, []);

  return { notice, showNotice, dismissNotice };
}

export function StatusTargetNotice({
  notice,
  onArrive,
  icon,
  dataTestId,
  style,
}: {
  notice: StatusTargetNotice;
  onArrive: (noticeId: number) => void;
  icon?: LucideIcon;
  dataTestId?: string;
  style?: CSSProperties;
}) {
  const tone = notice.tone ?? "info";
  const toneColor = tone === "success"
    ? LEGACY_COLORS.green
    : tone === "error"
      ? LEGACY_COLORS.red
      : LEGACY_COLORS.blue;
  const Icon = icon ?? (tone === "success" ? CheckCircle2 : tone === "error" ? AlertTriangle : Info);
  const noticeStyle = {
    background: "var(--c-popup-bg)",
    borderColor: `color-mix(in srgb, ${toneColor} 45%, transparent)`,
    color: toneColor,
    boxShadow: "var(--c-popup-shadow)",
    ...style,
  } as CSSProperties;

  return (
    <div
      data-testid={dataTestId}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className="status-target-notice pointer-events-none fixed left-1/2 top-1/2 z-[80] flex min-h-11 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-[16px] border px-5 py-3 text-sm font-black"
      style={noticeStyle}
      onAnimationEnd={(event) => {
        if (event.currentTarget !== event.target) return;
        onArrive(notice.id);
      }}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{notice.message}</span>
    </div>
  );
}
