---
type: file-explanation
source_path: "frontend/app/legacy/_components/common/LoadingSkeleton.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# LoadingSkeleton.tsx — LoadingSkeleton.tsx 설명

## 이 파일은 무엇을 책임지나

`LoadingSkeleton.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `LoadingSkeletonImpl`
- `Bar`
- `LoadingSkeleton`
- `Variant`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/common/📁_common]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

type Variant = "table" | "card" | "list";

interface Props {
  variant?: Variant;
  rows?: number;
  className?: string;
}

function LoadingSkeletonImpl({ variant = "list", rows = 4, className = "" }: Props) {
  const items = Array.from({ length: Math.max(1, rows) });

  if (variant === "table") {
    return (
      <div
        className={`overflow-hidden rounded-[16px] border ${className}`}
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        {items.map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[24px_1fr_1fr_80px_80px] items-center gap-3 px-4 py-3"
            style={{ borderBottom: i === items.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
          >
            <Bar w="full" h={14} />
            <Bar w="80%" h={12} />
            <Bar w="60%" h={12} />
            <Bar w="full" h={12} />
            <Bar w="full" h={12} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`grid gap-3 ${className}`} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {items.map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-[16px] border p-4"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <Bar w="50%" h={10} />
            <Bar w="80%" h={20} />
            <Bar w="40%" h={10} />
          </div>
        ))}
      </div>
    );
```
