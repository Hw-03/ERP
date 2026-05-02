"use client";

import { useState } from "react";
import { ChevronLeft, Lock } from "lucide-react";
import { LEGACY_COLORS } from "../../../legacyUi";
import { ELEVATION, TYPO } from "../../tokens";
import { IconButton } from "../../primitives";
import { PinLock } from "../../../PinLock";
import type { ToastState } from "@/features/mes/shared/Toast";
import { AdminBomSection } from "./AdminBomSection";
import { AdminEmployeesSection } from "./AdminEmployeesSection";
import { AdminItemsSection } from "./AdminItemsSection";
import { AdminPackagesSection } from "./AdminPackagesSection";
import { AdminSettingsSection } from "./AdminSettingsSection";
import { AdminHomeScreen, type AdminSection, ADMIN_SECTION_META } from "./AdminHomeScreen";

export function AdminShell({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<AdminSection | "home">("home");

  if (!unlocked) {
    return (
      <div className="px-4 pt-4 pb-6">
        <PinLock onUnlocked={() => setUnlocked(true)} />
      </div>
    );
  }

  if (section === "home") {
    return (
      <AdminHomeScreen
        onOpen={(id) => setSection(id)}
        onLock={() => setUnlocked(false)}
      />
    );
  }

  const meta = ADMIN_SECTION_META[section];

  return (
    <div className="flex flex-col">
      <div
        className="sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-3"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: ELEVATION.sticky,
        }}
      >
        <IconButton
          icon={ChevronLeft}
          label="목록으로"
          size="md"
          onClick={() => setSection("home")}
          color={LEGACY_COLORS.text}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`${TYPO.overline} font-bold uppercase tracking-[2px]`}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            관리자
          </div>
          <div
            className={`${TYPO.title} truncate font-black`}
            style={{ color: LEGACY_COLORS.text }}
          >
            {meta.label}
          </div>
        </div>
        <IconButton
          icon={Lock}
          label="잠금"
          size="md"
          onClick={() => setUnlocked(false)}
          color={LEGACY_COLORS.muted2}
        />
      </div>

      <div className="px-4 pt-4 pb-6">
        {section === "items" && <AdminItemsSection showToast={showToast} />}
        {section === "employees" && <AdminEmployeesSection showToast={showToast} />}
        {section === "bom" && <AdminBomSection showToast={showToast} />}
        {section === "packages" && <AdminPackagesSection showToast={showToast} />}
        {section === "settings" && <AdminSettingsSection showToast={showToast} />}
      </div>
    </div>
  );
}
