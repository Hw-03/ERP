"use client";

import { Suspense } from "react";
import { MobileShell } from "./_components/mobile/MobileShell";
import { DesktopLegacyShell } from "./_components/DesktopLegacyShell";
import { ErpLoginGate } from "./_components/login/ErpLoginGate";
import { DepartmentsProvider } from "./_components/DepartmentsContext";

export default function LegacyPage() {
  return (
    <DepartmentsProvider>
      <ErpLoginGate>
        <Suspense>
          <LegacyBody />
        </Suspense>
      </ErpLoginGate>
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
