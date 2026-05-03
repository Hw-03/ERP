"use client";

import Link from "next/link";
import { ClipboardCheck, RefreshCw, AlertTriangle, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { AlertsBanner } from "../AlertsBanner";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "./tokens";
import { SheetHeader } from "./primitives";

const LINKS = [
  { href: "/queue", label: "Queue", description: "배치 진행 현황", icon: RefreshCw, color: LEGACY_COLORS.blue },
  { href: "/alerts", label: "알림", description: "재고 경고 · 편차", icon: AlertTriangle, color: LEGACY_COLORS.yellow },
  { href: "/counts", label: "실사", description: "재고 실사 기록", icon: ClipboardCheck, color: LEGACY_COLORS.cyan },
];

export function AlertsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetHeader title="알림" subtitle="최근 알림 및 바로가기" onClose={onClose} />
      <div className="px-5 pb-4">
        <AlertsBanner />
      </div>
      <div className="flex flex-col gap-2 px-5 pb-2">
        {LINKS.map(({ href, label, description, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className="flex items-center gap-3 rounded-[20px] border px-4 py-3"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: `${color}22`, color }}
            >
              <Icon size={20} strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {label}
              </div>
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                {description}
              </div>
            </div>
            <ChevronRight size={18} color={LEGACY_COLORS.muted} />
          </Link>
        ))}
      </div>
    </BottomSheet>
  );
}
