"use client";

import { useState } from "react";
import { PanelRight } from "lucide-react";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { PinLock } from "./PinLock";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { OverviewBar } from "./_admin_sections/OverviewBar";
import { SectionHeader } from "./_admin_sections/SectionHeader";
import { AdminSidebar, SECTIONS, SETTINGS_ENTRY } from "./_admin_sections/AdminSidebar";
import { AdminSectionContent } from "./_admin_sections/AdminSectionContent";
import { AdminRightPanelContent } from "./_admin_sections/AdminRightPanelContent";
import { useAdminBootstrap } from "./_admin_hooks/useAdminBootstrap";
import { useAdminSettings } from "./_admin_hooks/useAdminSettings";
import { useAdminViewState } from "./_admin_hooks/useAdminViewState";

/**
 * Round-11A (#4) — 섹션 콘텐츠/우측 패널 콘텐츠 sub-component 추출 후 슬림화.
 * 본 파일은 PIN gate, 상단 헤더, 좌/우 레이아웃 wrapper 만 담당.
 */
export function DesktopAdminView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const {
    unlocked,
    adminPin,
    section,
    showRightPanel,
    selectedDept,
    setSelectedDept,
    unlock,
    lock,
    selectSection,
    togglePanel,
  } = useAdminViewState();

  const [message, setMessage] = useState("");

  const {
    items, setItems,
    employees, setEmployees,
    packages, setPackages,
    productModels, setProductModels,
    departments, setDepartments,
    allBomRows,
    refreshAllBom,
    loadData,
  } = useAdminBootstrap({
    unlocked,
    globalSearch,
    onError: setMessage,
  });

  const {
    pinForm, setPinForm,
    resetPin, setResetPin,
    saveMessage,
    showSave,
    changePin,
    resetDatabase,
  } = useAdminSettings({
    onStatusChange,
    onError: setMessage,
    onAfterReset: loadData,
  });

  if (!unlocked) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <div
          className="w-full max-w-[460px] rounded-[32px] border p-6"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            boxShadow: "var(--c-card-shadow)",
          }}
        >
          <PinLock onUnlocked={unlock} />
        </div>
      </div>
    );
  }

  const activeSection =
    SECTIONS.find((entry) => entry.id === section) ?? (section === "settings" ? SETTINGS_ENTRY : undefined);

  return (
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4">
      <div
        className="grid min-h-0 flex-1 gap-4"
        style={{ gridTemplateColumns: "220px minmax(0,1fr)", transition: "grid-template-columns 0.2s ease" }}
      >
        <AdminSidebar section={section} onSelect={selectSection} onLock={lock} />

        {/* 워크스페이스 */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          {/* 고정 헤더 */}
          <div className="mb-4 shrink-0">
            {activeSection && (
              <div className="flex items-start justify-between">
                <SectionHeader
                  icon={activeSection.icon}
                  label={activeSection.label}
                  description={activeSection.description}
                  danger={section === "settings"}
                />
                <button
                  onClick={togglePanel}
                  className="mt-1 ml-2 shrink-0 flex items-center justify-center rounded-[12px] border p-2 transition-colors hover:bg-white/10"
                  style={{
                    background: showRightPanel
                      ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)`
                      : LEGACY_COLORS.s2,
                    borderColor: showRightPanel ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                    color: showRightPanel ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2,
                  }}
                  title="요약 패널"
                >
                  <PanelRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {section === "items" && (
              <OverviewBar
                items={items}
                employees={employees}
                productModels={productModels}
                packages={packages}
                allBomRows={allBomRows}
              />
            )}
            {saveMessage && (
              <div
                className="mb-4 rounded-[16px] border px-4 py-3 text-sm font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 40%, transparent)`,
                  color: LEGACY_COLORS.green,
                }}
              >
                {saveMessage}
              </div>
            )}
            {message ? (
              <div className="mt-3 text-base" style={{ color: LEGACY_COLORS.red }}>{message}</div>
            ) : null}
          </div>

          {/* 섹션별 콘텐츠 */}
          <div className="min-h-0 flex-1 overflow-hidden">
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
              packages={packages}
              setPackages={setPackages}
              productModels={productModels}
              setProductModels={setProductModels}
              departments={departments}
              setDepartments={setDepartments}
              selectedDept={selectedDept}
              setSelectedDept={setSelectedDept}
              allBomRows={allBomRows}
              refreshAllBom={refreshAllBom}
              pinForm={pinForm}
              setPinForm={setPinForm}
              resetPin={resetPin}
              setResetPin={setResetPin}
              changePin={changePin}
              resetDatabase={resetDatabase}
              adminPin={adminPin}
            />
          </div>
        </section>
      </div>

      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: showRightPanel ? 420 : 0,
          transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="h-full pl-4"
          style={{
            opacity: showRightPanel ? 1 : 0,
            transform: showRightPanel ? "translateX(0)" : "translateX(18px)",
            transition: "opacity 260ms ease, transform 260ms ease",
            willChange: "transform, opacity",
          }}
        >
          <DesktopRightPanel title="관리 요약" subtitle="현재 작업 중인 관리자 영역의 핵심 수치를 요약합니다.">
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
              packages={packages}
              allBomRows={allBomRows}
            />
          </DesktopRightPanel>
        </div>
      </div>
    </div>
  );
}
