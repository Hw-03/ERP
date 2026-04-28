"use client";

import type { ElementType, ReactNode } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { LEGACY_COLORS, normalizeDepartment } from "./legacyUi";
import { ThemeToggle } from "./ThemeToggle";
import { StatusPill, inferToneFromStatus } from "./common";
import { clearCurrentOperator, useCurrentOperator } from "./login/useCurrentOperator";

const WAREHOUSE_ROLE_LABEL: Record<string, string | null> = {
  primary: "창고 정",
  deputy: "창고 부",
  none: null,
};

export function DesktopTopbar({
  title,
  icon: Icon,
  onRefresh,
  actionSlot,
  status,
}: {
  title: string;
  icon?: ElementType;
  onRefresh: () => void;
  actionSlot?: ReactNode;
  status?: string;
}) {
  const operator = useCurrentOperator();
  const roleLabel = operator ? WAREHOUSE_ROLE_LABEL[operator.warehouse_role] ?? null : null;

  const handleLogout = () => {
    if (!window.confirm("로그아웃하시겠습니까?")) return;
    clearCurrentOperator();
    window.location.reload();
  };

  return (
    <header className="pl-0 pr-4 pt-0">
      <div
        className="flex items-center gap-3 rounded-[28px] border px-5 py-4"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {Icon && (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px]"
                style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.blue }}
              >
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="text-[24px] font-black tracking-[-0.02em]">{title}</div>
          </div>
        </div>

        {status && <StatusPill tone={inferToneFromStatus(status)} label={status} title={status} />}

        {actionSlot}

        {operator && (
          <div
            className="flex items-center gap-2 rounded-[20px] border px-3 py-1.5"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
              {operator.name}
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
              · {normalizeDepartment(operator.department)}
            </span>
            {roleLabel && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.green} 18%, transparent)`,
                  color: LEGACY_COLORS.green,
                }}
              >
                {roleLabel}
              </span>
            )}
          </div>
        )}

        <ThemeToggle />

        <button
          onClick={onRefresh}
          title="새로고침"
          aria-label="새로고침"
          className="flex h-9 w-9 items-center justify-center rounded-[14px] border transition-opacity hover:opacity-90"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        {operator && (
          <button
            onClick={handleLogout}
            title="로그아웃"
            className="flex items-center gap-2 rounded-[18px] px-3 py-2 text-sm font-semibold border transition-opacity hover:opacity-90"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        )}
      </div>
    </header>
  );
}
