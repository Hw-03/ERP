"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DesktopPinLock } from "./DesktopPinLock";
import { AdminSidebar } from "./_admin_sections/AdminSidebar";
import { AdminSectionContent } from "./_admin_sections/AdminSectionContent";
import { useAdminBootstrap } from "./_admin_hooks/useAdminBootstrap";
import { useAdminSettings } from "./_admin_hooks/useAdminSettings";
import { useAdminViewState, type AdminSection } from "./_admin_hooks/useAdminViewState";
import { useConfirmNavigation } from "@/lib/ui/dirty-guard";
import { Toast, type ToastState } from "@/lib/ui/Toast";

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
    selectedDept,
    setSelectedDept,
    unlock,
    lock,
    selectSection,
  } = useAdminViewState("models");

  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const confirmAdminNavigation = useConfirmNavigation();

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

  // message / saveMessage → toast 동기화. inline 박스 제거하고 우상단 토스트로 통일.
  useEffect(() => {
    if (message) setToast({ message, type: "error" });
  }, [message]);
  useEffect(() => {
    if (saveMessage) setToast({ message: saveMessage, type: "success" });
  }, [saveMessage]);

  if (!unlocked) {
    return (
      <DesktopPinLock
        onUnlocked={unlock}
        onCancel={() => router.push("/mes?tab=dashboard", { scroll: false })}
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
        />

        {/* 워크스페이스 */}
        <section className="flex flex-col overflow-auto lg:min-h-0 lg:overflow-hidden">
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

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
