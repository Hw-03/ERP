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
}

type TabDef = { id: WarehouseSectionTab; label: string; tone: string };

export function WarehouseSectionTabs({ active, onChange, showQueue, showDeptQueue, cartCount = 0 }: Props) {
  const tabs: TabDef[] = [
    { id: "compose", label: "요청 작성", tone: LEGACY_COLORS.blue },
    { id: "cart", label: "작업 중", tone: LEGACY_COLORS.green },
    { id: "mine", label: "내 요청", tone: LEGACY_COLORS.purple },
  ];
  if (showQueue) tabs.push({ id: "queue", label: "창고 승인함", tone: LEGACY_COLORS.yellow });
  if (showDeptQueue) tabs.push({ id: "dept-queue", label: "부서 승인함", tone: LEGACY_COLORS.yellow });

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const badge = t.id === "cart" && cartCount > 0 ? cartCount : null;
        return (
          <TabButton
            key={t.id}
            label={t.label}
            badge={badge}
            tone={t.tone}
            active={active === t.id}
            onClick={() => onChange(t.id)}
          />
        );
      })}
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
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative rounded-[12px] border px-4 py-2.5 transition-colors hover:brightness-110"
      style={{ background: bg, borderColor: border }}
    >
      <div
        className="text-center text-[22px] font-black leading-tight tracking-[-0.02em]"
        style={{ color: tone }}
      >
        {label}
      </div>
      {badge !== null && (
        <div
          className="absolute right-4 top-1/2 -translate-y-1/2 text-[28px] font-black leading-none"
          style={{ color: tone }}
        >
          {badge}
        </div>
      )}
    </button>
  );
}
