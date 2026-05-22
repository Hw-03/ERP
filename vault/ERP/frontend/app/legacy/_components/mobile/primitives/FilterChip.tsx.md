---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/FilterChip.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# FilterChip.tsx — FilterChip.tsx 설명

## 이 파일은 무엇을 책임지나

`FilterChip.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `FilterChip`
- `FilterChipRow`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function FilterChip({
  label,
  active,
  onClick,
  color,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  className?: string;
}) {
  const activeColor = color ?? LEGACY_COLORS.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "shrink-0 rounded-full border px-3 py-[6px] font-semibold transition-all duration-150 active:scale-95",
        TYPO.caption,
        className,
      )}
      style={
        active
          ? { background: activeColor, borderColor: activeColor, color: LEGACY_COLORS.white }
          : { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }
      }
    >
      {label}
    </button>
  );
}

export function FilterChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex gap-2 overflow-x-auto scrollbar-hide pb-[2px]", className)}>{children}</div>
  );
}
```
