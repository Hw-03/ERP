"use client";

import { useCallback, useState } from "react";
import type { DepartmentMaster } from "@/lib/api";
import { useAdminSession } from "@/lib/auth/admin-session";

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
  | "export"
  | "audit"
  | "settings"
  | "departments"
  | "warehouseStructure"
  | "warehousePlacement";

export interface UseAdminViewStateResult {
  unlocked: boolean;
  adminPin: string;
  section: AdminSection;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: React.Dispatch<React.SetStateAction<DepartmentMaster | null>>;
  unlock: (pin: string) => void;
  lock: () => void;
  selectSection: (next: AdminSection) => void;
}

export function useAdminViewState(initialSection: AdminSection = "items"): UseAdminViewStateResult {
  const { setPin, clearPin } = useAdminSession();
  const [unlocked, setUnlocked] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [section, setSection] = useState<AdminSection>(initialSection);
  const [selectedDept, setSelectedDept] = useState<DepartmentMaster | null>(null);

  const unlock = useCallback((pin: string) => {
    setAdminPin(pin);
    setUnlocked(true);
    // W3-B: 세션에 PIN 등록 → 이후 모든 admin API 요청이 자동으로
    // X-Admin-Pin 헤더로 인증된다. 기존 body.pin 전송도 그대로 호환.
    setPin(pin);
  }, [setPin]);

  const lock = useCallback(() => {
    setUnlocked(false);
    // 잠금 시 세션 PIN 도 정리 — 다음 요청부터 헤더 미주입.
    clearPin();
  }, [clearPin]);

  const selectSection = useCallback((next: AdminSection) => {
    setSection(next);
  }, []);

  return {
    unlocked,
    adminPin,
    section,
    selectedDept,
    setSelectedDept,
    unlock,
    lock,
    selectSection,
  };
}
