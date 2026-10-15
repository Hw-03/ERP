"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MobileShell } from "./_components/mobile/MobileShell";
import { DesktopMesShell } from "./_components/DesktopMesShell";
import { MesLoginGate } from "./_components/login/MesLoginGate";
import { DepartmentsProvider } from "./_components/DepartmentsContext";
import { AdminSessionProvider } from "@/lib/auth/admin-session";
import { QueryProvider } from "@/lib/queries/client";
import { MesViewportSkeleton } from "./_components/MesViewportSkeleton";
import { blockBrowserSaveShortcut } from "@/lib/mes/blockBrowserSaveShortcut";
import { AppearancePreferencesProvider } from "./_components/useAppearancePreferences";

export default function MesPage() {
  return (
    <AdminSessionProvider>
      <QueryProvider>
        <DepartmentsProvider>
          <AppearancePreferencesProvider>
            <MesLoginGate>
              <Suspense>
                <MesBody />
              </Suspense>
            </MesLoginGate>
          </AppearancePreferencesProvider>
        </DepartmentsProvider>
      </QueryProvider>
    </AdminSessionProvider>
  );
}

function MesBody() {
  const pathname = usePathname();
  const router = useRouter();
  const isMissingRoute = Boolean(pathname && pathname !== "/mes" && pathname.startsWith("/mes/"));
  const recoveryContent = isMissingRoute ? <section className="m-auto p-6 text-center" aria-labelledby="missing-mes-title">
    <h2 id="missing-mes-title">페이지를 찾을 수 없습니다</h2>
    <p>주소를 확인하거나 메뉴에서 필요한 화면을 선택해 주세요.</p>
    <button type="button" onClick={() => window.history.back()}>뒤로가기</button>
    <a href="/mes?tab=dashboard">대시보드로</a>
  </section> : undefined;
  const onRecoveryNavigate = isMissingRoute ? (query: string) => router.push(`/mes${query}`) : undefined;
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [viewportSwitchError, setViewportSwitchError] = useState(false);
  const isDesktopRef = useRef<boolean | null>(null);
  const switchSequenceRef = useRef(0);
  const beforeViewportSwitchRef = useRef<(() => Promise<void | boolean>) | null>(null);

  useEffect(() => {
    window.addEventListener("keydown", blockBrowserSaveShortcut, true);
    return () => window.removeEventListener("keydown", blockBrowserSaveShortcut, true);
  }, []);

  const registerBeforeViewportSwitch = useCallback((handler: (() => Promise<void | boolean>) | null) => {
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
        if (await beforeViewportSwitchRef.current?.() === false) return;
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

  if (isDesktop === null) return <MesViewportSkeleton />;

  return (
    <>
      {isDesktop ? (
        <Suspense>
          <DesktopMesShell onBeforeViewportSwitchChange={registerBeforeViewportSwitch} recoveryContent={recoveryContent} onRecoveryNavigate={onRecoveryNavigate} />
        </Suspense>
      ) : (
        <MobileShell onBeforeViewportSwitchChange={registerBeforeViewportSwitch} recoveryContent={recoveryContent} onRecoveryNavigate={onRecoveryNavigate} />
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
