---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/SegmentedControl.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# SegmentedControl.tsx — SegmentedControl.tsx 설명

## 이 파일은 무엇을 책임지나

`SegmentedControl.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `SegmentedControl`
- `SegmentedTab`

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

export interface SegmentedTab<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number | null;
}

/**
 * 모바일 세그먼트 컨트롤 — `s2 + border + p-1` 트레이, 활성은 `s1 + shadow`.
 * ItemDetailSheet · IoHubScreen · HistoryScreen · HistoryDetailSheet 공통.
 */
export function SegmentedControl<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: SegmentedTab<T>[];
  active: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx("flex gap-1 rounded-[14px] border p-1", className)}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1 rounded-[10px] px-2 py-[7px] font-bold transition-[background-color]",
              TYPO.caption,
            )}
            style={{
              background: isActive ? (LEGACY_COLORS.s1 as string) : "transparent",
              color: isActive
                ? (LEGACY_COLORS.text as string)
                : (LEGACY_COLORS.muted2 as string),
              boxShadow: isActive ? "0 1px 6px rgba(0,0,0,.25)" : undefined,
            }}
          >
            <span className="truncate">{tab.label}</span>
```
