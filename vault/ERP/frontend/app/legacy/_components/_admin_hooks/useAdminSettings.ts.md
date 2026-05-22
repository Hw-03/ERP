---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_hooks/useAdminSettings.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useAdminSettings.ts — useAdminSettings.ts 설명

## 이 파일은 무엇을 책임지나

`useAdminSettings.ts`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useAdminSettings`
- `UseAdminSettingsOptions`
- `UseAdminSettingsResult`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
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
```
