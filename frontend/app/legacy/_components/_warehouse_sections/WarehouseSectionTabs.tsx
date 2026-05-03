"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

export type WarehouseSectionTab = "compose" | "cart" | "mine" | "queue";

/**
 * DesktopWarehouseView 의 4개 섹션 탭 (요청 작성 / 작업 중 / 내 요청 / 창고 승인함).
 *
 * Round-10B (#6) 추출. canSeeQueue 분기는 호출 측에서 처리하고, 본 컴포넌트는
 * 받은 tabs 배열만 렌더한다.
 */

interface Props {
  active: WarehouseSectionTab;
  onChange: (next: WarehouseSectionTab) => void;
  showQueue: boolean;
}

export function WarehouseSectionTabs({ active, onChange, showQueue }: Props) {
  const tabs: { id: WarehouseSectionTab; label: string }[] = [
    { id: "compose", label: "요청 작성" },
    { id: "cart", label: "작업 중" },
    { id: "mine", label: "내 요청" },
  ];
  if (showQueue) tabs.push({ id: "queue", label: "창고 승인함" });

  return (
    <div className="flex items-center gap-2">
      {tabs.map((t) => {
        const activeState = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className="rounded-full border px-4 py-1.5 text-sm font-bold transition"
            style={{
              background: activeState ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
              color: activeState ? "white" : LEGACY_COLORS.text,
              borderColor: activeState ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
