"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { ChevronDown, LogOut, RefreshCw } from "lucide-react";
import { LEGACY_COLORS, normalizeDepartment } from "./legacyUi";
import { ConfirmModal, StatusPill, inferToneFromStatus } from "./common";
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
  statusNonce,
}: {
  title: string;
  icon?: ElementType;
  onRefresh: () => void;
  actionSlot?: ReactNode;
  status?: string;
  statusNonce?: number;
}) {
  const operator = useCurrentOperator();
  const roleLabel = operator ? WAREHOUSE_ROLE_LABEL[operator.warehouse_role] ?? null : null;
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [dropdownOpen]);

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

        {status && (
          <span key={statusNonce} style={{ animation: "statusFlash 0.35s ease-out" }}>
            <StatusPill tone={inferToneFromStatus(status)} label={status} title={status} className="py-1.5 text-sm" />
          </span>
        )}

        {actionSlot}

        {operator && (
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-[20px] border px-3 py-1.5 transition-opacity hover:opacity-90"
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
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform"
                style={{
                  color: LEGACY_COLORS.muted,
                  transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {dropdownOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-[20px] border p-2 shadow-lg"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="px-3 py-2">
                  <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {operator.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: LEGACY_COLORS.muted }}>
                    {normalizeDepartment(operator.department)}
                  </div>
                  {roleLabel && (
                    <div
                      className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: `color-mix(in srgb, ${LEGACY_COLORS.green} 18%, transparent)`,
                        color: LEGACY_COLORS.green,
                      }}
                    >
                      {roleLabel}
                    </div>
                  )}
                </div>
                <div className="my-1 border-t" style={{ borderColor: LEGACY_COLORS.border }} />
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setShowLogoutModal(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{
                    color: LEGACY_COLORS.red,
                    background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onRefresh}
          title="동기화"
          aria-label="동기화"
          className="flex h-9 w-9 items-center justify-center rounded-[14px] border transition-opacity hover:opacity-90"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <ConfirmModal
        open={showLogoutModal}
        title="로그아웃"
        tone="caution"
        confirmLabel="로그아웃"
        onClose={() => setShowLogoutModal(false)}
        onConfirm={() => {
          clearCurrentOperator();
          window.location.reload();
        }}
      >
        로그아웃하시겠습니까?
      </ConfirmModal>
    </header>
  );
}
