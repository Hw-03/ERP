"use client";

import { useState, type CSSProperties } from "react";
import { Pencil, type LucideIcon } from "lucide-react";

export type StatusTargetNotice = {
  id: number;
  message: string;
};

function statusTargetOffset(): { offsetX: number; offsetY: number } {
  if (typeof document === "undefined") return { offsetX: 0, offsetY: 0 };
  const target = document.querySelector<HTMLElement>('[data-testid="desktop-status-target"]');
  const rect = target?.getBoundingClientRect();
  if (!rect) return { offsetX: 0, offsetY: 0 };
  return {
    offsetX: rect.left + rect.width / 2 - window.innerWidth / 2,
    offsetY: rect.top + rect.height / 2 - window.innerHeight / 2,
  };
}

export function StatusTargetNotice({
  notice,
  onArrive,
  icon: Icon = Pencil,
  dataTestId,
  style,
}: {
  notice: StatusTargetNotice;
  onArrive: (noticeId: number) => void;
  icon?: LucideIcon;
  dataTestId?: string;
  style?: CSSProperties;
}) {
  const [offset] = useState(statusTargetOffset);
  const noticeStyle = {
    ...style,
    "--status-target-notice-x": `${offset.offsetX}px`,
    "--status-target-notice-y": `${offset.offsetY}px`,
  } as CSSProperties;

  return (
    <div
      data-testid={dataTestId}
      role="status"
      aria-live="polite"
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
