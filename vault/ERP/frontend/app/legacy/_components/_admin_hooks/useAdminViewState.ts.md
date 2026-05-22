---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_hooks/useAdminViewState.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useAdminViewState.ts — useAdminViewState.ts 설명

## 이 파일은 무엇을 책임지나

`useAdminViewState.ts`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useAdminViewState`
- `AdminSection`
- `UseAdminViewStateResult`

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

import { useCallback, useState } from "react";
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
  | "export"
  | "audit"
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

  const unlock = useCallback((pin: string) => {
    setAdminPin(pin);
    setUnlocked(true);
  }, []);

  const lock = useCallback(() => {
    setUnlocked(false);
  }, []);

  const selectSection = useCallback((next: AdminSection) => {
    setSection(next);
```
