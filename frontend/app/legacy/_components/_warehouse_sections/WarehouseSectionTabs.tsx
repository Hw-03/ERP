"use client";

import { useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

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
  queueCount?: number;
  deptQueueCount?: number;
}

type TabDef = { id: WarehouseSectionTab; label: string; tone: string };

export function WarehouseSectionTabs({
  active,
  onChange,
  showQueue,
  showDeptQueue,
  cartCount = 0,
  queueCount = 0,
  deptQueueCount = 0,
}: Props) {
  const tabs: TabDef[] = [
    { id: "compose", label: "요청 작성", tone: LEGACY_COLORS.blue },
    { id: "cart", label: "작업 중", tone: LEGACY_COLORS.green },
    { id: "mine", label: "내 요청", tone: LEGACY_COLORS.purple },
  ];
  if (showQueue) tabs.push({ id: "queue", label: "창고 승인함", tone: LEGACY_COLORS.yellow });
  if (showDeptQueue) tabs.push({ id: "dept-queue", label: "부서 승인함", tone: LEGACY_COLORS.purple });

  const badgeFor = (id: WarehouseSectionTab): number | null => {
    if (id === "cart" && cartCount > 0) return cartCount;
    if (id === "queue" && queueCount > 0) return queueCount;
    if (id === "dept-queue" && deptQueueCount > 0) return deptQueueCount;
    return null;
  };

  return (
    <div
      role="tablist"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => (
        <TabButton
          key={t.id}
          label={t.label}
          badge={badgeFor(t.id)}
          tone={t.tone}
          active={active === t.id}
          onClick={() => onChange(t.id)}
        />
      ))}
    </div>
  );
}

function TabButton({
  label,
  badge,
  tone,
  active,
  onClick,
}: {
  label: string;
  badge: number | null;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = active ? tint(tone, 22) : hovered ? tint(tone, 16) : tint(tone, 8);
  const border = active || hovered ? tone : tint(tone, 35);

  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative min-h-[44px] rounded-[12px] border px-2 py-2 transition-colors hover:brightness-110 lg:px-4 lg:py-2.5"
      style={{ background: bg, borderColor: border }}
    >
      <div
        className="text-center text-xs leading-tight tracking-[-0.02em] break-keep lg:text-[22px]"
        style={{
          // WCAG AA: brand 컬러 텍스트는 연한 틴트 위 4.5:1 미달 → 다크 text 색.
          // 활성 구분은 배경 틴트(22%)+보더(tone)+굵기로.
          color: LEGACY_COLORS.text,
          fontWeight: active ? 900 : 700,
        }}
      >
        {label}
      </div>
      {badge !== null && (
        <div
          className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none text-white lg:right-3 lg:top-1/2 lg:h-5 lg:min-w-[20px] lg:-translate-y-1/2 lg:px-1.5 lg:text-[11px]"
          style={{ background: tone }}
        >
          {badge}
        </div>
      )}
    </button>
  );
}
