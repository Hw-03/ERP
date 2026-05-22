---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/AdminSectionContent.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AdminSectionContent.tsx — AdminSectionContent.tsx 설명

## 이 파일은 무엇을 책임지나

`AdminSectionContent.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdminSectionContent`
- `PinForm`
- `AdminSectionContentProps`

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

import type { Dispatch, SetStateAction } from "react";
import type { BOMDetailEntry, DepartmentMaster, Employee, Item, ProductModel } from "@/lib/api";
import { api } from "@/lib/api";
import { AdminMasterItemsSection } from "./AdminMasterItemsSection";
import { AdminEmployeesSection } from "./AdminEmployeesSection";
import { BomWorkbench } from "./_bom_workbench/BomWorkbench";
import { AdminMasterItemsProvider } from "./AdminMasterItemsContext";
import { AdminEmployeesProvider } from "./AdminEmployeesContext";
import { AdminModelsProvider } from "./AdminModelsContext";
import { AdminModelsSection } from "./AdminModelsSection";
import { AdminExportSection } from "./AdminExportSection";
import { AdminAuditLogSection } from "./AdminAuditLogSection";
import { AdminDangerZone } from "./AdminDangerZone";
import { AdminDepartmentsProvider } from "./AdminDepartmentsContext";
import { AdminDepartmentsSection } from "./AdminDepartmentsSection";

/**
 * Round-11A (#4) 추출 — DesktopAdminView 의 section 별 콘텐츠 분기.
 *
 * 7 section (items / employees / bom / models / departments / export / settings)
 * 의 Provider + Section 매핑을 부모 파일에서 분리해 본 컴포넌트로 흡수.
 */
type PinForm = { current_pin: string; new_pin: string; confirm_pin: string };

export interface AdminSectionContentProps {
  section: string;
  globalSearch: string;
  onStatusChange: (status: string) => void;
  setMessage: (m: string) => void;
  showSave: (text: string) => void;

  items: Item[];
  setItems: Dispatch<SetStateAction<Item[]>>;
  employees: Employee[];
  setEmployees: Dispatch<SetStateAction<Employee[]>>;
  productModels: ProductModel[];
  setProductModels: Dispatch<SetStateAction<ProductModel[]>>;
  departments: DepartmentMaster[];
  setDepartments: Dispatch<SetStateAction<DepartmentMaster[]>>;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: Dispatch<SetStateAction<DepartmentMaster | null>>;
  allBomRows: BOMDetailEntry[];
  refreshAllBom: () => void;
  refreshItems: () => Promise<void>;

  pinForm: PinForm;
  setPinForm: Dispatch<SetStateAction<PinForm>>;
  resetPin: string;
  setResetPin: Dispatch<SetStateAction<string>>;
  changePin: () => Promise<void>;
  resetDatabase: () => Promise<void>;
  adminPin: string;
}
```
