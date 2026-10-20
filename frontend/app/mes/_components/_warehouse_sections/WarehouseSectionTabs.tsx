"use client";

import { useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { Building2, ChevronRight, Handshake, Warehouse, Wrench } from "lucide-react";
import presentation from "../mobile/mobilePresentation.module.css";

export type WarehouseSectionTab = "compose" | "cart" | "mine" | "queue" | "as-research-queue" | "dept-queue" | "handover";

/**
 * DesktopWarehouseView 의 섹션 탭. 권한별로 "창고 승인함" / "부서 승인함" 가시성 분기.
 */

interface Props {
  active: WarehouseSectionTab;
  onChange: (next: WarehouseSectionTab) => void;
  showQueue: boolean;
  showDeptQueue: boolean;
  showAsResearchQueue?: boolean;
  showHandover?: boolean;
  cartCount?: number;
  queueCount?: number;
  deptQueueCount?: number;
  asResearchQueueCount?: number;
  handoverInboxCount?: number;
  loadingCounts?: WarehouseSectionTab[];
  unavailableCounts?: WarehouseSectionTab[];
  mobilePresentation?: boolean;
  mobileInboxView?: boolean;
  mobileInboxOpen?: boolean;
  onMobileInboxOpen?: () => void;
}

type TabDef = { id: WarehouseSectionTab; label: string; tone: string };

export function WarehouseSectionTabs({
  active,
  onChange,
  showQueue,
  showDeptQueue,
  showAsResearchQueue = false,
  showHandover = false,
  cartCount = 0,
  queueCount = 0,
  deptQueueCount = 0,
  asResearchQueueCount = 0,
  handoverInboxCount = 0,
  loadingCounts = [],
  unavailableCounts = [],
  mobilePresentation = false,
  mobileInboxView = false,
  mobileInboxOpen = false,
  onMobileInboxOpen,
}: Props) {
  const tabs: TabDef[] = [
    { id: "compose", label: "요청 작성", tone: LEGACY_COLORS.blue },
    { id: "cart", label: "작성 중", tone: LEGACY_COLORS.green },
    { id: "mine", label: "내 요청", tone: LEGACY_COLORS.purple },
  ];
  if (showQueue) tabs.push({ id: "queue", label: "창고 승인함", tone: LEGACY_COLORS.yellow });
  if (showAsResearchQueue) tabs.push({ id: "as-research-queue", label: "AS·연구 승인함", tone: LEGACY_COLORS.blue });
  if (showDeptQueue) tabs.push({ id: "dept-queue", label: "부서 승인함", tone: LEGACY_COLORS.cyan });
  if (showHandover) tabs.push({ id: "handover", label: "인수인계", tone: LEGACY_COLORS.red });

  const badgeFor = (id: WarehouseSectionTab): number | null => {
    if (id === "cart" && cartCount > 0) return cartCount;
    if (id === "queue" && queueCount > 0) return queueCount;
    if (id === "dept-queue" && deptQueueCount > 0) return deptQueueCount;
    if (id === "as-research-queue" && asResearchQueueCount > 0) return asResearchQueueCount;
    if (id === "handover" && handoverInboxCount > 0) return handoverInboxCount;
    return null;
  };

  if (mobilePresentation) {
    const inboxTabs = tabs.slice(3);
    const selectedInbox = inboxTabs.find((tab) => tab.id === active);
    if (mobileInboxView) {
      return (
        <div aria-label="승인함 목록" className={`${presentation.surface} ${presentation.choiceList}`}>
          {inboxTabs.map((tab) => (
            <button key={tab.id} type="button" aria-pressed={active === tab.id}
              onClick={() => onChange(tab.id)} className={presentation.menuRow}>
              <span className={presentation.choiceIcon} style={{ color: tab.id === "as-research-queue" ? LEGACY_COLORS.red : tab.tone }} aria-hidden="true">
                {tab.id === "queue" ? <Warehouse /> : tab.id === "as-research-queue" ? <Wrench /> : tab.id === "handover" ? <Handshake /> : <Building2 />}
              </span>
              <span className="min-w-0 flex-1">{tab.label}</span>
              {unavailableCounts.includes(tab.id) ? <span aria-label={`${tab.label} 건수 확인 실패`}>—</span> : loadingCounts.includes(tab.id) ? <span role="status" aria-label={`${tab.label} 건수 불러오는 중`}>…</span> : badgeFor(tab.id) !== null && <span className="text-sm tabular-nums" style={{ color: LEGACY_COLORS.blue }}>{badgeFor(tab.id)}</span>}
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} aria-hidden />
            </button>
          ))}
        </div>
      );
    }
    const navigationTabs = [
      ...tabs.slice(0, 3).map((tab) => ({ ...tab, selected: !mobileInboxOpen && active === tab.id, onClick: () => onChange(tab.id), badge: badgeFor(tab.id) })),
      ...(inboxTabs.length ? [{ id: "inbox" as const, label: "승인함", selected: mobileInboxOpen || Boolean(selectedInbox), onClick: () => onMobileInboxOpen?.(), badge: null }] : []),
    ];
    return (
      <div>
          <div role="tablist" aria-label="입출고" className="grid min-w-0 gap-1 rounded-[16px] border p-1" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, gridTemplateColumns: `repeat(${navigationTabs.length}, minmax(0, 1fr))` }}>
            {navigationTabs.map((tab) => (
              <button key={tab.id} type="button" role="tab" aria-selected={tab.selected} onClick={tab.onClick}
                className="no-btn-inset flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[12px] border px-1 text-sm font-semibold transition-colors active:scale-[0.98]"
                style={{ background: tab.selected ? LEGACY_COLORS.blueSolid : LEGACY_COLORS.s2, borderColor: tab.selected ? LEGACY_COLORS.blueSolid : LEGACY_COLORS.border, color: tab.selected ? LEGACY_COLORS.white : LEGACY_COLORS.muted2 }}>
                {tab.label}
                {tab.id !== "inbox" && unavailableCounts.includes(tab.id) ? <span aria-label={`${tab.label} 건수 확인 실패`}>—</span> : tab.id !== "inbox" && loadingCounts.includes(tab.id) ? <span role="status" aria-label={`${tab.label} 건수 불러오는 중`}>…</span> : tab.badge !== null && <span className="text-xs tabular-nums">{tab.badge}</span>}
              </button>
            ))}
          </div>
        {!mobileInboxOpen && selectedInbox && <p className="py-2 text-[15px] font-semibold">{selectedInbox.label}</p>}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${mobilePresentation ? Math.min(3, tabs.length) : tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => (
        <TabButton
          key={t.id}
          label={t.label}
          badge={badgeFor(t.id)}
          loading={loadingCounts.includes(t.id)}
          tone={t.tone}
          active={active === t.id}
          onClick={() => onChange(t.id)}
          mobilePresentation={mobilePresentation}
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
  loading = false,
  mobilePresentation = false,
}: {
  label: string;
  badge: number | null;
  tone: string;
  active: boolean;
  onClick: () => void;
  loading?: boolean;
  mobilePresentation?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = mobilePresentation
    ? active ? tint(LEGACY_COLORS.blue, 10) : LEGACY_COLORS.s2
    : active ? tint(tone, 22) : hovered ? tint(tone, 16) : tint(tone, 8);
  const border = mobilePresentation
    ? active ? LEGACY_COLORS.blue : LEGACY_COLORS.border
    : active || hovered ? tone : tint(tone, 35);

  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={mobilePresentation
        ? "no-btn-inset relative flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[12px] border px-2 py-2 transition-colors"
        : "no-btn-inset relative min-h-[60px] min-w-0 rounded-[12px] border px-1.5 py-3 transition-colors hover:brightness-110 lg:min-h-[44px] lg:px-4 lg:py-2.5"}
      style={{ background: bg, borderColor: border }}
    >
      <div className={mobilePresentation ? "text-center text-sm leading-tight break-keep" : "text-center text-sm leading-tight tracking-[-0.02em] break-keep lg:text-[22px]"}>
        {/* 모바일: WCAG AA — 다크 text + 활성=900/비활성=700 */}
        <span
          className={mobilePresentation ? undefined : "lg:hidden"}
          style={{ color: LEGACY_COLORS.text, fontWeight: active ? 900 : 700 }}
        >
          {label}
        </span>
        {/* 데스크탑: 브랜드 tone 컬러 + font-black (어제 이전 룩 원복) */}
        <span className={mobilePresentation ? "hidden" : "hidden font-black lg:inline"} style={{ color: tone }}>
          {label}
        </span>
      </div>
      {(loading || badge !== null) && (
        <div
          className={mobilePresentation
            ? "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-xs font-bold leading-none text-white"
            : "absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none text-white lg:right-3 lg:top-1/2 lg:h-5 lg:min-w-[20px] lg:-translate-y-1/2 lg:px-1.5 lg:text-[11px]"}
          style={{ background: tone }}
        >
          {loading ? <span role="status" aria-label={`${label} 건수 불러오는 중`} className="h-2.5 w-2 rounded motion-safe:animate-pulse" style={{ background: LEGACY_COLORS.white }} /> : badge}
        </div>
      )}
    </button>
  );
}
