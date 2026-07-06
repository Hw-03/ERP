"use client";

import { Suspense, useLayoutEffect, useState } from "react";
import { MobileShell } from "./_components/mobile/MobileShell";
import { DesktopMesShell } from "./_components/DesktopMesShell";
import { MesLoginGate } from "./_components/login/MesLoginGate";
import { DepartmentsProvider } from "./_components/DepartmentsContext";
import { AdminSessionProvider } from "@/lib/auth/admin-session";
import { QueryProvider } from "@/lib/queries/client";

export default function MesPage() {
  return (
    <AdminSessionProvider>
      <QueryProvider>
        <DepartmentsProvider>
          <MesLoginGate>
            <Suspense>
              <MesBody />
            </Suspense>
          </MesLoginGate>
        </DepartmentsProvider>
      </QueryProvider>
    </AdminSessionProvider>
  );
}

function MesBody() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const syncViewport = () => setIsDesktop(window.innerWidth >= 1024);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  if (isDesktop === null) return null;

  if (!isDesktop) {
    return <MobileShell />;
  }

  return (
    <Suspense>
      <DesktopMesShell />
    </Suspense>
  );
}
