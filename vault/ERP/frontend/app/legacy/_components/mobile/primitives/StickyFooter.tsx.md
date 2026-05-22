---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/StickyFooter.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# StickyFooter.tsx — StickyFooter.tsx 설명

## 이 파일은 무엇을 책임지나

`StickyFooter.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `StickyFooter`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function StickyFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx("sticky bottom-0 z-30 border-t px-4 pt-3", className)}
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        paddingBottom: "calc(env(safe-area-inset-bottom, 12px) + 12px)",
        boxShadow: "0 -12px 24px rgba(0,0,0,.24)",
      }}
    >
      {children}
    </div>
  );
}
```
