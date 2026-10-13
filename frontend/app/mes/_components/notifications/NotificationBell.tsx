"use client";

import { Bell } from "lucide-react";
import type { ReactElement } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { NotificationDialog } from "./NotificationDialog";
import { useNotificationController } from "./useNotificationController";

export interface NotificationNavigationTarget {
  tab: string;
  section: string | null;
  relatedRequestId: string | null;
}

/** A bell button without queries or login-marker ownership. */
export function NotificationBellButton({ unread, onClick, mobilePresentation = false }: {
  unread: number;
  onClick: () => void;
  mobilePresentation?: boolean;
}): ReactElement {
  return <button type="button" onClick={onClick} title="알림" aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
    className="relative flex h-11 w-11 items-center justify-center rounded-[14px] border"
    style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
    <Bell className={mobilePresentation ? "h-5 w-5" : "h-4 w-4"} style={unread > 0 ? { animation: "statusFlash 1.2s ease-in-out infinite" } : undefined} />
    {unread > 0 && <span key={unread} className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none text-white"
      style={{ background: LEGACY_COLORS.redSolid }}>{unread > 99 ? "99+" : unread}</span>}
  </button>;
}

/** Desktop owner; the mobile shell owns its controller independently of the button. */
export function NotificationBell({ onNavigate, loginDialogEnabled, mobilePresentation = false }: {
  onNavigate?: (target: NotificationNavigationTarget) => void;
  loginDialogEnabled: boolean;
  mobilePresentation?: boolean;
}): ReactElement | null {
  const operator = useCurrentOperator();
  const controller = useNotificationController({ operator, onNavigate, loginDialogEnabled });
  if (!operator?.employee_id) return null;
  return <div ref={controller.visibilityRef} className="relative">
    <NotificationBellButton unread={controller.unread} onClick={controller.openDialog} mobilePresentation={mobilePresentation} />
    {controller.open && <NotificationDialog {...controller.dialogProps} mobilePresentation={mobilePresentation} />}
  </div>;
}
