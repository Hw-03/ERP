"use client";

import { useCallback, useEffect, useState } from "react";
import type { DepartmentMaster } from "@/lib/api";

/**
 * 관리자 화면의 UI 상태 묶음.
 *
 * Round-10B (#1) 추출. DesktopAdminView 의 top-level UI useState 5개 +
 * section→panel 강제오픈 effect 1개를 단일 hook 으로 묶었다.
 *
 * 데이터 / 도메인 상태는 useAdminBootstrap, useAdminSettings 가 담당하고,
 * 본 hook 은 잠금/탭/우측 패널/선택 부서 같은 화면 표현 상태만 책임진다.
 */
export type AdminSection =
  | "items"
  | "employees"
  | "models"
  | "bom"
  | "packages"
  | "export"
  | "settings"
  | "departments";

export interface UseAdminViewStateResult {
  unlocked: boolean;
  adminPin: string;
  section: AdminSection;
  showRightPanel: boolean;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: React.Dispatch<React.SetStateAction<DepartmentMaster | null>>;
  unlock: (pin: string) => void;
  lock: () => void;
  selectSection: (next: AdminSection) => void;
  togglePanel: () => void;
}

export function useAdminViewState(initialSection: AdminSection = "items"): UseAdminViewStateResult {
  const [unlocked, setUnlocked] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [section, setSection] = useState<AdminSection>(initialSection);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [selectedDept, setSelectedDept] = useState<DepartmentMaster | null>(null);

  // 부서 섹션 진입 시 우측 패널을 자동으로 열어 두면 부서 선택 → 관리 흐름이 끊기지 않는다.
  useEffect(() => {
    if (section === "departments") setShowRightPanel(true);
  }, [section]);

  const unlock = useCallback((pin: string) => {
    setAdminPin(pin);
    setUnlocked(true);
  }, []);

  const lock = useCallback(() => {
    setUnlocked(false);
  }, []);

  const selectSection = useCallback((next: AdminSection) => {
    setSection(next);
  }, []);

  const togglePanel = useCallback(() => {
    setShowRightPanel((v) => !v);
  }, []);

  return {
    unlocked,
    adminPin,
    section,
    showRightPanel,
    selectedDept,
    setSelectedDept,
    unlock,
    lock,
    selectSection,
    togglePanel,
  };
}
