---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/AdminSidebar.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AdminSidebar.tsx — AdminSidebar.tsx 설명

## 이 파일은 무엇을 책임지나

`AdminSidebar.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdminSidebar`
- `SECTIONS`
- `SETTINGS_ENTRY`
- `SectionMeta`
- `Props`

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

import type { ElementType } from "react";
import {
  Box,
  Building2,
  Download,
  FileArchive,
  KeyRound,
  Layers,
  Lock,
  Network,
  PanelRight,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SidebarButton } from "./SidebarButton";
import type { AdminSection } from "../_admin_hooks/useAdminViewState";

export interface SectionMeta {
  id: AdminSection;
  label: string;
  description: string;
  icon: ElementType;
}

export const SECTIONS: SectionMeta[] = [
  { id: "models", label: "모델 관리", description: "제품 모델 등록 및 사용 현황", icon: Layers },
  { id: "items", label: "품목 관리", description: "품목 기본 정보·재고·BOM 관리", icon: Box },
  { id: "employees", label: "직원 관리", description: "직원 활성·권한·PIN 관리", icon: Users },
  { id: "departments", label: "부서 관리", description: "부서 추가·색상·구성원 관리", icon: Building2 },
  { id: "bom", label: "BOM 관리", description: "부모-자식 자재 구성 편집", icon: Network },
  { id: "export", label: "내보내기", description: "엑셀 / CSV 데이터 내보내기", icon: Download },
  { id: "audit", label: "외부 제출용 로그", description: "심사 대비 월별 입출고 CSV", icon: FileArchive },
];

export const SETTINGS_ENTRY: SectionMeta = {
  id: "settings",
  label: "설정",
  description: "관리자 PIN, 데이터 초기화",
  icon: KeyRound,
};

const SECTION_GROUPS: { title: string; ids: AdminSection[] }[] = [
  { title: "기준 정보", ids: ["models", "items", "employees", "departments"] },
  { title: "구성 관리", ids: ["bom"] },
  { title: "시스템", ids: ["export", "audit"] },
];

interface Props {
  section: AdminSection;
  onSelect: (next: AdminSection) => void;
  onLock: () => void;
  showRightPanel?: boolean;
```
