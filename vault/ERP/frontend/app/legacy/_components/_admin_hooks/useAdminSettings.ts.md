---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_hooks/useAdminSettings.ts
tags: [vault, code-note, auto-generated, stub]
---

# useAdminSettings.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_hooks/useAdminSettings.ts]]

## 원본 첫 줄

```
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
```
