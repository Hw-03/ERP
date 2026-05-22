---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomBadge.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomBadge.tsx — BomBadge.tsx 설명

## 이 파일은 무엇을 책임지나

`BomBadge.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomBadge`
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

import { LEGACY_COLORS } from "@/lib/mes/color";
import { deptBadgeBg, deptColor, deptOf } from "./bomDept";

/**
 * 부서+단계 배지. 예: "HA" (고압 중간공정), "TR" (튜브 원자재).
 *
 * 시각: 부서 색상 12% 배경 + 진한 부서색 글자. process_type_code 가 null/잘못된
 * 값이면 muted "?" 배지.
 */
interface Props {
  processTypeCode: string | null | undefined;
  /** 작은 배지 (10px 폰트). 기본은 12px. */
  small?: boolean;
}

export function BomBadge({ processTypeCode, small = false }: Props) {
  const dept = deptOf(processTypeCode);
  const label = (processTypeCode ?? "?").slice(0, 2).toUpperCase();

  const fontSize = small ? "10px" : "12px";
  const padding = small ? "2px 7px" : "3px 9px";

  if (!dept) {
    return (
      <span
        className="inline-flex items-center rounded-md font-bold tracking-wider"
        style={{
          fontSize,
          padding,
          background: LEGACY_COLORS.s2,
          color: LEGACY_COLORS.muted2,
          border: `1px solid ${LEGACY_COLORS.border}`,
        }}
      >
        ?
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-md font-bold tracking-wider"
      style={{
        fontSize,
        padding,
        background: deptBadgeBg(dept),
        color: deptColor(dept),
      }}
    >
      {label}
    </span>
  );
}
```
