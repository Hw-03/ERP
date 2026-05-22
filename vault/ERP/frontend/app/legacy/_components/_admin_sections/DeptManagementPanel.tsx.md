---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/DeptManagementPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DeptManagementPanel.tsx — DeptManagementPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`DeptManagementPanel.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DeptManagementPanel`
- `DepartmentMaster`
- `DeptManagementPanelProps`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { api, type DepartmentMaster } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { employeeColor } from "@/lib/mes/color";
import { useRefreshDepartments } from "../DepartmentsContext";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";

/**
 * 우측 패널의 부서 상세 편집 영역.
 *
 * DesktopAdminView 본체에서 분리 — 부서 색상 변경 / 활성 토글 / 영구 삭제만 담당.
 * 화면 구조 / 동작 / 스타일은 그대로 유지한다.
 */
export interface DeptManagementPanelProps {
  dept: DepartmentMaster;
  adminPin: string;
  /**
   * 호출처에서 전달하지만 패널 본문에서는 사용하지 않는다 (호환 유지용).
   * 미래에 부서 목록 기반 조작이 들어올 자리.
   */
  departments: DepartmentMaster[];
  setDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
  setSelectedDept: (d: DepartmentMaster | null) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
}

export function DeptManagementPanel({
  dept,
  adminPin,
  setDepartments,
  setSelectedDept,
  onStatusChange,
  onError,
}: DeptManagementPanelProps) {
  const savedColor = dept.color_hex ?? employeeColor(dept.name);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [localColor, setLocalColor] = useState(savedColor);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const refreshDepartments = useRefreshDepartments();

  useEffect(() => {
    setLocalColor(dept.color_hex ?? employeeColor(dept.name));
  }, [dept.id, dept.color_hex, dept.name]);

  const colorChanged = localColor.toLowerCase() !== savedColor.toLowerCase();

  function applyColor() {
    void api
      .updateDepartment(dept.id, { color_hex: localColor, pin: adminPin })
      .then((updated) => {
        setDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
```
