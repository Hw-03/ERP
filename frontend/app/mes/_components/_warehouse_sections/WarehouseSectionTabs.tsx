"use client";

import { useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export type WarehouseSectionTab = "compose" | "cart" | "mine" | "queue" | "dept-queue" | "handover";

/**
 * DesktopWarehouseView 의 섹션 탭. 권한별로 "창고 승인함" / "부서 승인함" 가시성 분기.
 */

interface Props {
  active: WarehouseSectionTab;
  onChange: (next: WarehouseSectionTab) => void;
  showQueue: boolean;
  showDeptQueue: boolean;
  showHandover?: boolean;
  cartCount?: number;
  queueCount?: number;
  deptQueueCount?: number;
  handoverInboxCount?: number;
}

type TabDef = { id: WarehouseSectionTab; label: string; tone: string };

export function WarehouseSectionTabs({
  active,
  onChange,
  showQueue,
  showDeptQueue,
  showHandover = false,
  cartCount = 0,
  queueCount = 0,
  deptQueueCount = 0,
  handoverInboxCount = 0,
}: Props) {
  const tabs: TabDef[] = [
    { id: "compose", label: "요청 작성", tone: LEGACY_COLORS.blue },
    { id: "cart", label: "작업 중", tone: LEGACY_COLORS.green },
    { id: "mine", label: "내 요청", tone: LEGACY_COLORS.purple },
  ];
  if (showQueue) tabs.push({ id: "queue", label: "창고 승인함", tone: LEGACY_COLORS.yellow });
  if (showDeptQueue) tabs.push({ id: "dept-queue", label: "부서 승인함", tone: LEGACY_COLORS.cyan });
  if (showHandover) tabs.push({ id: "handover", label: "인수인계", tone: LEGACY_COLORS.red });

  const badgeFor = (id: WarehouseSectionTab): number | null => {
    if (id === "cart" && cartCount > 0) return cartCount;
    if (id === "queue" && queueCount > 0) return queueCount;
    if (id === "dept-queue" && deptQueueCount > 0) return deptQueueCount;
    if (id === "handover" && handoverInboxCount > 0) return handoverInboxCount;
    return null;
  };

  return (
    <div
      role="tablist"
      // 항목 4 — 모바일도 데스크톱과 동일하게 grid 균등분할(탭 수 무관 전폭). gridTemplateColumns 가 양쪽 모두 적용.
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
      className="relative min-h-[44px] min-w-0 rounded-[12px] border px-2 py-2 transition-colors hover:brightness-110 lg:px-4 lg:py-2.5"
      style={{ background: bg, borderColor: border }}
    >
      <div className="text-center text-xs leading-tight tracking-[-0.02em] break-keep lg:text-[22px]">
        {/* 모바일: WCAG AA — 다크 text + 활성=900/비활성=700 */}
        <span
          className="lg:hidden"
          style={{ color: LEGACY_COLORS.text, fontWeight: active ? 900 : 700 }}
        >
          {label}
        </span>
        {/* 데스크탑: 브랜드 tone 컬러 + font-black (어제 이전 룩 원복) */}
        <span className="hidden font-black lg:inline" style={{ color: tone }}>
          {label}
        </span>
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
