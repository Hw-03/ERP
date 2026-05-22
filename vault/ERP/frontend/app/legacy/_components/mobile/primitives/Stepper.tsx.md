---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/Stepper.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# Stepper.tsx — Stepper.tsx 설명

## 이 파일은 무엇을 책임지나

`Stepper.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Stepper`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  bigStep = 10,
  danger = false,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  bigStep?: number;
  danger?: boolean;
  className?: string;
}) {
  const clamp = (next: number) => {
    let v = next;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  const color = danger ? LEGACY_COLORS.red : LEGACY_COLORS.blue;

  return (
    <div className={clsx("flex items-stretch overflow-hidden rounded-[14px] border", className)} style={{ borderColor: LEGACY_COLORS.border }}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - bigStep))}
        className={clsx("px-2 font-bold", TYPO.caption)}
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}
        aria-label={`-${bigStep}`}
      >
        -{bigStep}
      </button>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        className="flex h-10 w-10 items-center justify-center"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
        aria-label="감소"
      >
        <Minus size={16} />
      </button>
```
