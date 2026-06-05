"use client";

import { Suspense } from "react";
import { MobileShell } from "./_components/mobile/MobileShell";
import { DesktopLegacyShell } from "./_components/DesktopLegacyShell";
import { MesLoginGate } from "./_components/login/MesLoginGate";
import { DepartmentsProvider } from "./_components/DepartmentsContext";
import { AdminSessionProvider } from "@/lib/auth/admin-session";
import { QueryProvider } from "@/lib/queries/client";

export default function LegacyPage() {
  return (
    <AdminSessionProvider>
      <QueryProvider>
        <DepartmentsProvider>
          <MesLoginGate>
            <Suspense>
              <LegacyBody />
            </Suspense>
          </MesLoginGate>
        </DepartmentsProvider>
      </QueryProvider>
    </AdminSessionProvider>
  );
}

function LegacyBody() {
  return (
    <>
      <div className="lg:hidden">
        <MobileShell />
      </div>

      <Suspense>
        <DesktopLegacyShell />
      </Suspense>
    </>
  );
}
