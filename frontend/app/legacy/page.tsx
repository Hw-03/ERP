"use client";

import { Suspense } from "react";
import { MobileShell } from "./_components/mobile/MobileShell";
import { DesktopLegacyShell } from "./_components/DesktopLegacyShell";
import { MesLoginGate } from "./_components/login/MesLoginGate";
import { DepartmentsProvider } from "./_components/DepartmentsContext";

export default function LegacyPage() {
  return (
    <DepartmentsProvider>
      <MesLoginGate>
        <Suspense>
          <LegacyBody />
        </Suspense>
      </MesLoginGate>
    </DepartmentsProvider>
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
