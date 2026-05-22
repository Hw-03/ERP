---
type: file-explanation
source_path: "frontend/app/legacy/_components/common/AppSelect.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AppSelect.tsx — AppSelect.tsx 설명

## 이 파일은 무엇을 책임지나

`AppSelect.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AppSelect`
- `AppSelectOption`
- `AppSelectProps`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/common/📁_common]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface AppSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  triggerClassName?: string;
  triggerStyle?: React.CSSProperties;
  triggerAriaLabel?: string;
  name?: string;
}

const SIZE_TRIGGER: Record<NonNullable<AppSelectProps["size"]>, string> = {
  sm: "rounded-[10px] px-2 py-1.5 text-xs",
  md: "rounded-[14px] px-3 py-2 text-sm",
  lg: "rounded-[18px] px-4 py-3 text-base",
};

const SIZE_CHEVRON: Record<NonNullable<AppSelectProps["size"]>, string> = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

function firstEnabledIndex(opts: AppSelectOption[]): number {
  for (let i = 0; i < opts.length; i++) if (!opts[i].disabled) return i;
  return -1;
}
function lastEnabledIndex(opts: AppSelectOption[]): number {
  for (let i = opts.length - 1; i >= 0; i--) if (!opts[i].disabled) return i;
  return -1;
}
function nextEnabledIndex(opts: AppSelectOption[], from: number, dir: 1 | -1): number {
  if (opts.length === 0) return -1;
  let i = from < 0 ? (dir === 1 ? -1 : opts.length) : from;
  for (let step = 0; step < opts.length; step++) {
    i = (i + dir + opts.length) % opts.length;
    if (!opts[i].disabled) return i;
  }
  return from;
}
```
