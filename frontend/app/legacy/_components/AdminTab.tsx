"use client";

import { useState } from "react";
import { PinLock } from "./PinLock";
import type { ToastState } from "./Toast";
import { LEGACY_COLORS } from "./legacyUi";
import { AdminItemsSection } from "./mobile/screens/admin/AdminItemsSection";
import { AdminEmployeesSection } from "./mobile/screens/admin/AdminEmployeesSection";
import { AdminBomSection } from "./mobile/screens/admin/AdminBomSection";
import { AdminPackagesSection } from "./mobile/screens/admin/AdminPackagesSection";
import { AdminSettingsSection } from "./mobile/screens/admin/AdminSettingsSection";

type Section = "items" | "employees" | "bom" | "packages" | "settings";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "items", label: "상품" },
  { id: "employees", label: "직원" },
  { id: "bom", label: "BOM" },
  { id: "packages", label: "출하묶음" },
  { id: "settings", label: "설정" },
];

function SectionTabs({
  section,
  setSection,
  onLock,
}: {
  section: Section;
  setSection: (next: Section) => void;
  onLock: () => void;
}) {
  return (
    <div className="mb-3 flex gap-[7px] overflow-x-auto">
      {SECTIONS.map((entry) => (
        <button
          key={entry.id}
          onClick={() => setSection(entry.id)}
          className="shrink-0 rounded-full border px-4 py-[7px] text-xs font-bold transition-all hover:brightness-110"
          style={{
            background: section === entry.id ? LEGACY_COLORS.purple : LEGACY_COLORS.s2,
            borderColor: section === entry.id ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
            color: section === entry.id ? "#fff" : LEGACY_COLORS.muted2,
          }}
        >
          {entry.label}
        </button>
      ))}
      <button
        onClick={onLock}
        className="ml-auto shrink-0 rounded-full border px-4 py-[7px] text-xs font-bold transition-all hover:brightness-110"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        잠금
      </button>
    </div>
  );
}

export function AdminTab({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<Section>("items");

  if (!unlocked) {
    return <PinLock onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <div className="pb-4">
      <SectionTabs section={section} setSection={setSection} onLock={() => setUnlocked(false)} />
      {section === "items" && <AdminItemsSection showToast={showToast} />}
      {section === "employees" && <AdminEmployeesSection showToast={showToast} />}
      {section === "bom" && <AdminBomSection showToast={showToast} />}
      {section === "packages" && <AdminPackagesSection showToast={showToast} />}
      {section === "settings" && <AdminSettingsSection showToast={showToast} />}
    </div>
  );
}
