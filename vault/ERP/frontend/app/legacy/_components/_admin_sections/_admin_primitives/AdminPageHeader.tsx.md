---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_admin_primitives/AdminPageHeader.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AdminPageHeader.tsx — AdminPageHeader.tsx 설명

## 이 파일은 무엇을 책임지나

`AdminPageHeader.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdminPageHeader`
- `AdminPageHeaderProps`

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

import type { ElementType, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface AdminPageHeaderProps {
  icon: ElementType;
  title: string;
  description?: string;
  actions?: ReactNode;
  danger?: boolean;
}

export function AdminPageHeader({
  icon: Icon,
  title,
  description,
  actions,
  danger = false,
}: AdminPageHeaderProps) {
  const tone = danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
          style={{
            background: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2
              className="truncate text-[22px] font-black leading-tight"
              style={{ color: LEGACY_COLORS.text }}
            >
              {title}
            </h2>
            {danger && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
                  color: LEGACY_COLORS.red,
                }}
              >
                <AlertTriangle className="h-3 w-3" />
                위험 영역
              </span>
            )}
```
