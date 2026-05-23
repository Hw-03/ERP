"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PanelRight } from "lucide-react";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { DesktopPinLock } from "./DesktopPinLock";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AdminSidebar } from "./_admin_sections/AdminSidebar";
import { AdminSectionContent } from "./_admin_sections/AdminSectionContent";
import { AdminRightPanelContent } from "./_admin_sections/AdminRightPanelContent";
import { useAdminBootstrap } from "./_admin_hooks/useAdminBootstrap";
import { useAdminSettings } from "./_admin_hooks/useAdminSettings";
import { useAdminViewState, type AdminSection } from "./_admin_hooks/useAdminViewState";
import { useAdminDirty } from "./_admin_sections/AdminDirtyRegistry";

/**
 * 섹션 헤더와 KPI는 각 섹션이 직접 그린다 (AdminPageHeader / AdminKpiBar 사용).
 * 본 파일은 PIN gate, 좌/우 레이아웃 wrapper, 토스트 영역만 담당.
 */
export function DesktopAdminView({
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
    showRightPanel,
    selectedDept,
    setSelectedDept,
    unlock,
    lock,
    selectSection,
    togglePanel,
  } = useAdminViewState("models");

  const [message, setMessage] = useState("");
  const { confirmAdminNavigation } = useAdminDirty();

  // 트리거 (b) — 사이드바 섹션 변경 가드
  const guardedSelectSection = (next: AdminSection) =>
    confirmAdminNavigation(() => selectSection(next));

  const {
    items, setItems,
    employees, setEmployees,
    productModels, setProductModels,
    departments, setDepartments,
    allBomRows,
    refreshAllBom,
    refreshItems,
    loadData,
  } = useAdminBootstrap({
    unlocked,
    globalSearch,
    onError: setMessage,
  });

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
      <DesktopPinLock
        onUnlocked={unlock}
        onCancel={() => router.push("/legacy?tab=dashboard", { scroll: false })}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4 overflow-y-auto lg:overflow-hidden">
      <div
        className="flex flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1"
        style={{ gridTemplateColumns: "240px minmax(0,1fr)", transition: "grid-template-columns 0.2s ease" }}
      >
        <AdminSidebar
          section={section}
          onSelect={guardedSelectSection}
          onLock={lock}
          showRightPanel={showRightPanel}
          onTogglePanel={togglePanel}
        />

        {/* 워크스페이스 */}
        <section className="flex flex-col overflow-auto lg:min-h-0 lg:overflow-hidden">
          {/* 토스트 영역 (섹션 헤더는 각 섹션이 직접 렌더링) */}
          {(saveMessage || message) && (
            <div role="alert" aria-live="polite" className="mb-3 flex shrink-0 flex-col gap-2">
              {saveMessage && (
                <div
                  className="rounded-[14px] border px-4 py-2.5 text-[13px] font-bold"
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
                  className="rounded-[14px] border px-4 py-2.5 text-[13px] font-bold"
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

          {/* 섹션별 콘텐츠 */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
              allBomRows={allBomRows}
            />
          </DesktopRightPanel>
        </div>
      </div>
    </div>
  );
}
