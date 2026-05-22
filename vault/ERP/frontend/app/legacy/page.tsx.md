---
type: file-explanation
source_path: "frontend/app/legacy/page.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# page.tsx — page.tsx 설명

## 이 파일은 무엇을 책임지나

`page.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/legacy/page.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `LegacyPage`
- `LegacyBody`

## 연결되는 파일

- [[ERP/frontend/app/legacy/📁_legacy]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { Suspense } from "react";
import { MobileShell } from "./_components/mobile/MobileShell";
import { DesktopLegacyShell } from "./_components/DesktopLegacyShell";
import { MesLoginGate } from "./_components/login/MesLoginGate";
import { DepartmentsProvider } from "./_components/DepartmentsContext";

export default function LegacyPage() {
  return (
    <DepartmentsProvider>
      <MesLoginGate>
        <Suspense>
          <LegacyBody />
        </Suspense>
      </MesLoginGate>
    </DepartmentsProvider>
  );
}

function LegacyBody() {
  return (
    <>
      <div className="lg:hidden">
        <MobileShell />
      </div>

      <Suspense>
        <DesktopLegacyShell />
      </Suspense>
    </>
  );
}
```
