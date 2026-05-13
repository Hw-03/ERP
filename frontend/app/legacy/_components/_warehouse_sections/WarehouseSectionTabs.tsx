"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

export type WarehouseSectionTab = "compose" | "cart" | "mine" | "queue" | "dept-queue";

/**
 * DesktopWarehouseView 의 섹션 탭. 권한별로 "창고 승인함" / "부서 승인함" 가시성 분기.
 */

interface Props {
  active: WarehouseSectionTab;
  onChange: (next: WarehouseSectionTab) => void;
  showQueue: boolean;
  showDeptQueue: boolean;
  cartCount?: number;
}

export function WarehouseSectionTabs({ active, onChange, showQueue, showDeptQueue, cartCount = 0 }: Props) {
  const tabs: { id: WarehouseSectionTab; label: string }[] = [
    { id: "compose", label: "요청 작성" },
    { id: "cart", label: "작업 중" },
    { id: "mine", label: "내 요청" },
  ];
  if (showQueue) tabs.push({ id: "queue", label: "창고 승인함" });
  if (showDeptQueue) tabs.push({ id: "dept-queue", label: "부서 승인함" });

  return (
    <div className="flex items-center gap-2">
      {tabs.map((t) => {
        const activeState = active === t.id;
        const showBadge = t.id === "cart" && cartCount > 0;
        const inactiveAlert = !activeState && showBadge;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className="relative rounded-full border px-4 py-1.5 text-sm font-bold transition"
            style={{
              background: activeState
                ? LEGACY_COLORS.blue
                : inactiveAlert
                ? `color-mix(in srgb, ${LEGACY_COLORS.green} 18%, ${LEGACY_COLORS.s2})`
                : LEGACY_COLORS.s2,
              color: activeState
                ? "white"
                : inactiveAlert
                ? LEGACY_COLORS.green
                : LEGACY_COLORS.text,
              borderColor: activeState
                ? LEGACY_COLORS.blue
                : inactiveAlert
                ? LEGACY_COLORS.green
                : LEGACY_COLORS.border,
            }}
          >
            {t.label}
            {showBadge && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black text-white"
                style={{ background: LEGACY_COLORS.green }}
              >
                {cartCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
