"use client";

import { useEffect, useState, type JSX, type ReactNode } from "react";
import { LEGACY_COLORS as C } from "@/lib/mes/color";

/** 준비된 작업 본문을 드러내고 종료 후 장식용 덮개를 제거한다. */
export function WorkContentCover({ pending, failed = false, surface = false, children }: {
  pending: boolean;
  failed?: boolean;
  surface?: boolean;
  children?: ReactNode;
}): JSX.Element | null {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (pending) { setVisible(true); return; }
    if (!visible) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finish = (): void => { if (motion.matches || failed) setVisible(false); };
    finish();
    motion.addEventListener?.("change", finish);
    return () => motion.removeEventListener?.("change", finish);
  }, [pending, visible, failed]);

  if (failed || (!pending && !visible)) return null;
  return <div data-work-content-cover aria-hidden inert
    className={`pointer-events-none absolute inset-0 z-20 ${pending ? "" : "desktop-loading-cover-exit"}`}
    style={{ backgroundColor: C.bg, backgroundImage: surface ? `linear-gradient(${C.s1}, ${C.s1})` : undefined, animationDuration: "220ms" }}
    onAnimationEnd={(event) => { if (event.target === event.currentTarget && !pending) setVisible(false); }}>
    {children}
  </div>;
}
