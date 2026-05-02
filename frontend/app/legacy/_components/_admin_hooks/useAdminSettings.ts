"use client";

import { useState } from "react";
import { api } from "@/lib/api";

/**
 * 관리자 설정 페이지 (PIN 변경 / DB 초기화 / 저장 토스트) 상태 + 액션 훅.
 *
 * Round-9 (R9-5) 추출. DesktopAdminView 의 4 useState + 3 함수 분리.
 *
 * 동작 변화 0 — pinForm/resetPin/saveMessage 상태 + changePin/resetDatabase/showSave 액션.
 */
export interface UseAdminSettingsOptions {
  onStatusChange: (status: string) => void;
  onError: (message: string) => void;
  onAfterReset: () => Promise<void>;
}

export interface UseAdminSettingsResult {
  pinForm: { current_pin: string; new_pin: string; confirm_pin: string };
  setPinForm: React.Dispatch<React.SetStateAction<{ current_pin: string; new_pin: string; confirm_pin: string }>>;
  resetPin: string;
  setResetPin: React.Dispatch<React.SetStateAction<string>>;
  saveMessage: string | null;
  showSave: (text: string) => void;
  changePin: () => Promise<void>;
  resetDatabase: () => Promise<void>;
}

export function useAdminSettings(opts: UseAdminSettingsOptions): UseAdminSettingsResult {
  const { onStatusChange, onError, onAfterReset } = opts;

  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [resetPin, setResetPin] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function showSave(text: string) {
    setSaveMessage(text);
    setTimeout(() => setSaveMessage(null), 2500);
  }

  async function changePin() {
    if (pinForm.new_pin !== pinForm.confirm_pin) {
      onError("새 PIN과 확인 PIN이 일치하지 않습니다.");
      return;
    }
    await api.updateAdminPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
    setPinForm({ current_pin: "", new_pin: "", confirm_pin: "" });
    onError("관리자 PIN을 변경했습니다.");
    onStatusChange("관리자 PIN을 변경했습니다.");
  }

  async function resetDatabase() {
    await api.resetDatabase(resetPin);
    setResetPin("");
    await onAfterReset();
    onError("기본 데이터 기준으로 다시 적재했습니다.");
    onStatusChange("기본 데이터 기준으로 다시 적재했습니다.");
  }

  return {
    pinForm, setPinForm,
    resetPin, setResetPin,
    saveMessage,
    showSave,
    changePin,
    resetDatabase,
  };
}
