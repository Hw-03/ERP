"use client";

import { Suspense, useCallback, useLayoutEffect, useRef, useState } from "react";
import { MobileShell } from "./_components/mobile/MobileShell";
import { DesktopMesShell } from "./_components/DesktopMesShell";
import { MesLoginGate } from "./_components/login/MesLoginGate";
import { DepartmentsProvider } from "./_components/DepartmentsContext";
import { AdminSessionProvider } from "@/lib/auth/admin-session";
import { QueryProvider } from "@/lib/queries/client";

export default function MesPage() {
  return (
    <QueryProvider>
      <MesLoginGate>
        <AdminSessionProvider>
          <DepartmentsProvider>
            <Suspense>
              <MesBody />
            </Suspense>
          </DepartmentsProvider>
        </AdminSessionProvider>
      </MesLoginGate>
    </QueryProvider>
  );
}

function MesBody() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [viewportSwitchError, setViewportSwitchError] = useState(false);
  const isDesktopRef = useRef<boolean | null>(null);
  const switchSequenceRef = useRef(0);
  const beforeViewportSwitchRef = useRef<(() => Promise<void>) | null>(null);

  const registerBeforeViewportSwitch = useCallback((handler: (() => Promise<void>) | null) => {
    beforeViewportSwitchRef.current = handler;
  }, []);

  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    isDesktopRef.current = mediaQuery.matches;
    setIsDesktop(mediaQuery.matches);

    const handleViewportChange = async (event: MediaQueryListEvent) => {
      const nextIsDesktop = event.matches;
      const sequence = switchSequenceRef.current + 1;
      switchSequenceRef.current = sequence;
      if (nextIsDesktop === isDesktopRef.current) return;

      setViewportSwitchError(false);

      try {
        await beforeViewportSwitchRef.current?.();
      } catch {
        if (switchSequenceRef.current === sequence) {
          setViewportSwitchError(true);
        }
        return;
      }

      if (switchSequenceRef.current !== sequence) return;

      normalizeTabForViewport(nextIsDesktop);
      isDesktopRef.current = nextIsDesktop;
      setIsDesktop(nextIsDesktop);
    };

    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  if (isDesktop === null) return null;

  return (
    <>
      {isDesktop ? (
        <Suspense>
          <DesktopMesShell onBeforeViewportSwitchChange={registerBeforeViewportSwitch} />
        </Suspense>
      ) : (
        <MobileShell onBeforeViewportSwitchChange={registerBeforeViewportSwitch} />
      )}
      {viewportSwitchError && (
        <div
          role="alert"
          className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg"
        >
          작성 중인 작업을 저장하지 못해 화면 모드를 전환하지 않았습니다.
        </div>
      )}
    </>
  );
}

function normalizeTabForViewport(nextIsDesktop: boolean) {
  const url = new URL(window.location.href);
  const currentTab = url.searchParams.get("tab");
  const nextTab = nextIsDesktop
    ? currentTab === "assemblyChecklist" || currentTab === "more"
      ? "dashboard"
      : currentTab
    : currentTab === "admin"
      ? "more"
      : currentTab;

  if (nextTab && nextTab !== currentTab) {
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
}
