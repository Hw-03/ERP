---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/SummaryChipBar.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# SummaryChipBar.tsx — SummaryChipBar.tsx 설명

## 이 파일은 무엇을 책임지나

`SummaryChipBar.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `SummaryChipBar`
- `SummaryChip`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export type SummaryChip = {
  key: string;
  label: string;
  tone?: string;
  onClick?: () => void;
  onRemove?: () => void;
};

export function SummaryChipBar({
  chips,
  trailing,
  className,
}: {
  chips: SummaryChip[];
  trailing?: React.ReactNode;
  className?: string;
}) {
  if (chips.length === 0 && !trailing) return null;
  return (
    <div className={clsx("flex items-center gap-2 overflow-x-auto scrollbar-hide", className)}>
      {chips.map((chip) => {
        const tone = chip.tone ?? LEGACY_COLORS.blue;
        const Wrapper = chip.onClick ? "button" : "div";
        return (
          <Wrapper
            key={chip.key}
            type={chip.onClick ? "button" : undefined}
            onClick={chip.onClick}
            className={clsx(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-[6px] font-semibold transition-[transform,opacity]",
              chip.onClick && "active:scale-95",
              TYPO.caption,
            )}
            style={{
              background: `${tone as string}1a`,
              borderColor: `${tone as string}44`,
              color: tone,
            }}
          >
            <span className="truncate max-w-[160px]">{chip.label}</span>
            {chip.onRemove ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  chip.onRemove?.();
                }}
```
