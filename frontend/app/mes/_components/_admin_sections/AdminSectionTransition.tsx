"use client";

import { startTransition, useEffect, useState, type ReactElement } from "react";
import type { AdminSection } from "../_admin_hooks/useAdminViewState";
import { AdminSectionContent, type AdminSectionContentProps } from "./AdminSectionContent";
import { AdminSectionEntrySkeleton } from "./AdminSectionEntrySkeleton";
import { useAdminReadState, type AdminReadDomain } from "./_admin_primitives/AdminReadState";
import styles from "./AdminTransitions.module.css";

function needsEntry(section: AdminSection | null): section is "items" | "bom" {
  return section === "items" || section === "bom";
}

/** 목표 화면의 틀을 먼저 그린 뒤에만 무거운 본문을 마운트한다. */
export function AdminSectionTransition({ section, contentProps }: {
  section: AdminSection;
  contentProps: Omit<AdminSectionContentProps, "section">;
}): ReactElement {
  const domains: AdminReadDomain[] = section === "items" ? ["items", "models"] : section === "bom" ? ["items", "bom"] : [];
  const entryRead = useAdminReadState(...domains);
  const ready = !!entryRead.managed && !entryRead.loading && !entryRead.error;
  const [preparedSection, setPreparedSection] = useState<AdminSection | null>(() => needsEntry(section) && !ready ? null : section);
  const [coverSection, setCoverSection] = useState<AdminSection | null>(() => needsEntry(section) && !ready ? section : null);
  const warmEntry = ready && coverSection !== section;
  const contentSection = needsEntry(section) && !warmEntry ? preparedSection : section;
  const pending = contentSection !== section;
  const waiting = pending || (coverSection === section && entryRead.loading);
  const covered = needsEntry(section) && (pending || coverSection === section);

  useEffect(() => {
    if (!needsEntry(section) || warmEntry) {
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
  }, [section, preparedSection, warmEntry]);

  useEffect(() => {
    if (waiting || coverSection !== section) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finish = (): void => {
      if (motion.matches) setCoverSection((current) => current === section ? null : current);
    };
    finish();
    motion.addEventListener?.("change", finish);
    return () => motion.removeEventListener?.("change", finish);
  }, [waiting, coverSection, section]);

  return <div className="relative flex min-h-0 flex-1 flex-col" aria-busy={waiting} data-admin-entry-covered={covered || undefined}>
    {contentSection !== null && <div
      key={`content-${contentSection}`}
      data-admin-section-reveal={needsEntry(contentSection) ? undefined : ""}
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${needsEntry(contentSection) ? "" : styles.fade}`}
      style={{ display: pending ? "none" : undefined }}
      inert={waiting || undefined}
      aria-hidden={waiting || undefined}
    >
      <AdminSectionContent {...contentProps} section={contentSection} />
    </div>}
    {covered && <div
      key={`entry-${section}`}
      data-testid="admin-section-entry-cover"
      className={`absolute inset-0 z-30 flex min-h-0 flex-col ${styles.entryCover} ${waiting ? "" : styles.entryExit}`}
      aria-hidden={!waiting || undefined}
      inert={!waiting || undefined}
      role={waiting ? "status" : undefined}
      aria-label={waiting ? `${section === "items" ? "품목 관리" : "BOM 관리"} 불러오는 중` : undefined}
      aria-busy={waiting}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !waiting) setCoverSection((current) => current === section ? null : current);
      }}
    >
      <AdminSectionEntrySkeleton section={section} />
    </div>}
  </div>;
}
