"use client";

import { Suspense } from "react";
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
  return (
    <>
      <div className="lg:hidden">
        <MobileShell />
      </div>

      <Suspense>
        <DesktopMesShell />
      </Suspense>
    </>
  );
}
