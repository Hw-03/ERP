"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DesktopPinLock } from "../../DesktopPinLock";
import { SubScreenHeader } from "../primitives";
import { SECTIONS, SETTINGS_ENTRY } from "../../_admin_sections/AdminSidebar";
import { AdminSectionContent } from "../../_admin_sections/AdminSectionContent";
import { AdminRightPanelContent } from "../../_admin_sections/AdminRightPanelContent";
import { useAdminBootstrap } from "../../_admin_hooks/useAdminBootstrap";
import { useAdminSettings } from "../../_admin_hooks/useAdminSettings";
import { useAdminViewState, type AdminSection } from "../../_admin_hooks/useAdminViewState";

const ALL_SECTIONS = [...SECTIONS, SETTINGS_ENTRY];

/**
 * 관리자 모바일 화면.
 *
 * 데스크탑 DesktopAdminView 의 240px 사이드바 + 420px 우측 슬라이드 그리드는
 * 393px 에서 구겨진다. 동일한 PIN 게이트/훅(useAdminViewState·Bootstrap·
 * Settings)을 그대로 재사용하되, 모바일은 섹션 허브(리스트) → 드릴다운
 * 풀스크린 패턴으로 재구성한다.
 */
export function MobileAdminScreen({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const router = useRouter();
  const {
    unlocked,
    adminPin,
    section,
    selectedDept,
    setSelectedDept,
    unlock,
    selectSection,
  } = useAdminViewState("models");

  const [message, setMessage] = useState("");
  const [entered, setEntered] = useState<AdminSection | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const {
    items, setItems,
    employees, setEmployees,
    productModels, setProductModels,
    departments, setDepartments,
    allBomRows,
    refreshAllBom,
    refreshItems,
    loadData,
  } = useAdminBootstrap({ unlocked, globalSearch, onError: setMessage });

  const {
    pinForm, setPinForm,
    saveMessage,
    showSave,
    changePin,
  } = useAdminSettings({
    onStatusChange,
    onError: setMessage,
  });

  if (!unlocked) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
        <DesktopPinLock
          onUnlocked={unlock}
          onCancel={() => router.push("/legacy?tab=dashboard", { scroll: false })}
        />
      </div>
    );
  }

  function openSection(id: AdminSection) {
    selectSection(id);
    setEntered(id);
    setSummaryOpen(false);
  }

  // ── 허브 (섹션 리스트) ──
  if (entered == null) {
    return (
      <div
        className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ background: LEGACY_COLORS.bg }}
      >
        <div className="flex flex-col gap-2.5 px-3 py-4">
          <h2 className="px-1 text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
            관리자
          </h2>
          {ALL_SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => openSection(s.id)}
                className="flex min-h-[68px] items-center gap-3 rounded-[16px] border p-3.5 text-left transition-[transform] active:scale-[0.99]"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
                  style={{ background: LEGACY_COLORS.s3 }}
                >
                  <Icon size={20} color={LEGACY_COLORS.blue} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black" style={{ color: LEGACY_COLORS.text }}>
                    {s.label}
                  </span>
                  <span className="block text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                    {s.description}
                  </span>
                </span>
                <ChevronRight size={18} color={LEGACY_COLORS.muted2} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 섹션 드릴다운 (풀스크린) ──
  const meta = ALL_SECTIONS.find((s) => s.id === entered);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: LEGACY_COLORS.bg }}
    >
      <SubScreenHeader
        title={meta?.label ?? "관리"}
        subtitle="관리자"
        onBack={() => setEntered(null)}
        right={
          <button
            type="button"
            onClick={() => setSummaryOpen((v) => !v)}
            className="min-h-[40px] rounded-[12px] border px-3 text-xs font-bold"
            style={{
              background: summaryOpen ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: summaryOpen ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
            }}
          >
            요약
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {(saveMessage || message) && (
          <div role="alert" aria-live="polite" className="mb-3 flex flex-col gap-2">
            {saveMessage && (
              <div
                className="rounded-[12px] border px-4 py-2.5 text-[13px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 40%, transparent)`,
                  color: LEGACY_COLORS.green,
                }}
              >
                {saveMessage}
              </div>
            )}
            {message && (
              <div
                className="rounded-[12px] border px-4 py-2.5 text-[13px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
                  color: LEGACY_COLORS.red,
                }}
              >
                {message}
              </div>
            )}
          </div>
        )}

        {summaryOpen && (
          <div
            className="mb-3 rounded-[16px] border p-3"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="mb-2 text-xs font-black uppercase tracking-[1.5px]"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              관리 요약
            </div>
            <AdminRightPanelContent
              section={section}
              selectedDept={selectedDept}
              setSelectedDept={setSelectedDept}
              departments={departments}
              setDepartments={setDepartments}
              adminPin={adminPin}
              onStatusChange={onStatusChange}
              setMessage={setMessage}
              items={items}
              employees={employees}
              allBomRows={allBomRows}
            />
          </div>
        )}

        <AdminSectionContent
          section={section}
          globalSearch={globalSearch}
          onStatusChange={onStatusChange}
          setMessage={setMessage}
          showSave={showSave}
          items={items}
          setItems={setItems}
          employees={employees}
          setEmployees={setEmployees}
          productModels={productModels}
          setProductModels={setProductModels}
          departments={departments}
          setDepartments={setDepartments}
          selectedDept={selectedDept}
          setSelectedDept={setSelectedDept}
          allBomRows={allBomRows}
          refreshAllBom={refreshAllBom}
          refreshItems={refreshItems}
          pinForm={pinForm}
          setPinForm={setPinForm}
          changePin={changePin}
          adminPin={adminPin}
        />
      </div>
    </div>
  );
}
