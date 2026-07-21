"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { isAdminPinLengthValid, type AdminPinForm } from "./adminPinValidation";

/**
 * 관리자 설정 페이지 (PIN 변경) 상태 + 액션 훅.
 *
 * Round-9 (R9-5) 추출. DesktopAdminView 의 상태·함수 분리.
 * Admin settings state is limited to PIN change UI.
 */
export interface UseAdminSettingsOptions {
  onStatusChange: (status: string) => void;
  onError: (message: string) => void;
}

export interface UseAdminSettingsResult {
  pinForm: AdminPinForm;
  setPinForm: React.Dispatch<React.SetStateAction<AdminPinForm>>;
  isSaving: boolean;
  saveMessage: string | null;
  showSave: (text: string) => void;
  changePin: () => Promise<void>;
}

export function useAdminSettings(opts: UseAdminSettingsOptions): UseAdminSettingsResult {
  const { onStatusChange, onError } = opts;

  const [pinForm, setPinForm] = useState<AdminPinForm>({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  function showSave(text: string) {
    setSaveMessage(text);
    setTimeout(() => setSaveMessage(null), 2500);
  }

  async function changePin() {
    if (isSavingRef.current) return;

    const validationError = validatePinForm(pinForm);
    if (validationError) {
      onError(validationError);
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    let response: { message: string };
    try {
      response = await api.updateAdminPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
    } catch (error) {
      try {
        onError(error instanceof Error ? error.message : "관리자 PIN 변경에 실패했습니다.");
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
      return;
    }

    try {
      setPinForm({ current_pin: "", new_pin: "", confirm_pin: "" });
      showSave(response.message);
      onStatusChange(response.message);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  return {
    pinForm, setPinForm,
    isSaving,
    saveMessage,
    showSave,
    changePin,
  };
}

function validatePinForm(pinForm: AdminPinForm): string | null {
  if ([pinForm.current_pin, pinForm.new_pin, pinForm.confirm_pin].some(
    (pin) => !isAdminPinLengthValid(pin),
  )) {
    return "PIN은 4~32자로 입력하세요.";
  }
  if (pinForm.new_pin !== pinForm.confirm_pin) {
    return "새 PIN과 확인 PIN이 일치하지 않습니다.";
  }
  return null;
}
