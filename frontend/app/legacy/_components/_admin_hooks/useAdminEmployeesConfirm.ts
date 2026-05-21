"use client";

import { useState } from "react";
import type { Employee } from "@/lib/api";

/**
 * Round-15 (#2) 추출 — useAdminEmployees 의 3 confirmation modal state.
 *
 * 책임:
 *   - 활성/비활성 토글 confirm
 *   - PIN 초기화 confirm (관리자 PIN 입력)
 *   - 삭제 confirm
 */
export function useAdminEmployeesConfirm() {
  const [confirmTarget, setConfirmTarget] = useState<Employee | null>(null);
  const [pinResetTarget, setPinResetTarget] = useState<Employee | null>(null);
  const [pinResetAdminPin, setPinResetAdminPin] = useState("");
  const [pinResetError, setPinResetError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  function requestPinReset(e: Employee) {
    setPinResetTarget(e);
    setPinResetAdminPin("");
    setPinResetError("");
  }

  function cancelPinReset() {
    setPinResetTarget(null);
    setPinResetAdminPin("");
    setPinResetError("");
  }

  return {
    confirmTarget, setConfirmTarget,
    pinResetTarget, setPinResetTarget,
    pinResetAdminPin, setPinResetAdminPin,
    pinResetError, setPinResetError,
    deleteTarget, setDeleteTarget,
    requestPinReset,
    cancelPinReset,
  };
}
