"use client";

import { startTransition, useEffect, useState, type ReactElement } from "react";
import type { AdminSection } from "../_admin_hooks/useAdminViewState";
import { AdminSectionContent, type AdminSectionContentProps } from "./AdminSectionContent";
import { AdminSectionEntrySkeleton } from "./AdminSectionEntrySkeleton";
import styles from "./AdminTransitions.module.css";

function needsEntry(section: AdminSection | null): section is "items" | "bom" {
  return section === "items" || section === "bom";
}

/** 목표 화면의 틀을 먼저 그린 뒤에만 무거운 본문을 마운트한다. */
export function AdminSectionTransition({ section, contentProps }: {
  section: AdminSection;
  contentProps: Omit<AdminSectionContentProps, "section">;
}): ReactElement {
  const [preparedSection, setPreparedSection] = useState<AdminSection | null>(() => needsEntry(section) ? null : section);
  const [coverSection, setCoverSection] = useState<AdminSection | null>(() => needsEntry(section) ? section : null);
  const contentSection = needsEntry(section) ? preparedSection : section;
  const pending = contentSection !== section;
  const covered = needsEntry(section) && (pending || coverSection === section);

  useEffect(() => {
    if (!needsEntry(section)) {
      setPreparedSection(section);
      setCoverSection(null);
      return;
    }
    if (preparedSection === section) return;
    setCoverSection(section);
    let active = true;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      // 첫 콜백에서는 본문을 만들지 않고 로딩 틀의 그리기 기회를 넘긴다.
      secondFrame = requestAnimationFrame(() => {
        if (active) startTransition(() => setPreparedSection(section));
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [section, preparedSection]);

  useEffect(() => {
    if (pending || coverSection !== section) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finish = (): void => {
      if (motion.matches) setCoverSection((current) => current === section ? null : current);
    };
    finish();
    motion.addEventListener?.("change", finish);
    return () => motion.removeEventListener?.("change", finish);
  }, [pending, coverSection, section]);

  return <div className="relative flex min-h-0 flex-1 flex-col" aria-busy={pending} data-admin-entry-covered={covered || undefined}>
    {contentSection !== null && <div
      key={`content-${contentSection}`}
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${needsEntry(contentSection) ? "" : styles.fade}`}
      style={{ display: pending ? "none" : undefined }}
      inert={pending || undefined}
      aria-hidden={pending || undefined}
    >
      <AdminSectionContent {...contentProps} section={contentSection} />
    </div>}
    {covered && <div
      key={`entry-${section}`}
      data-testid="admin-section-entry-cover"
      className={`absolute inset-0 z-30 flex min-h-0 flex-col ${styles.entryCover} ${pending ? "" : styles.entryExit}`}
      aria-hidden={!pending || undefined}
      inert={!pending || undefined}
      role={pending ? "status" : undefined}
      aria-label={pending ? `${section === "items" ? "품목 관리" : "BOM 관리"} 불러오는 중` : undefined}
      aria-busy={pending}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !pending) setCoverSection((current) => current === section ? null : current);
      }}
    >
      <AdminSectionEntrySkeleton section={section} />
    </div>}
  </div>;
}
