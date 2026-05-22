---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/QuickActionGrid.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# QuickActionGrid.tsx — QuickActionGrid.tsx 설명

## 이 파일은 무엇을 책임지나

`QuickActionGrid.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `QuickActionGrid`
- `QuickAction`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  tone?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function QuickActionGrid({
  actions,
  columns = 2,
  className,
}: {
  actions: QuickAction[];
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={clsx("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {actions.map(({ id, label, description, icon: Icon, tone, onClick, disabled }) => {
        const accent = tone ?? (LEGACY_COLORS.blue as string);
        return (
          <button
            key={id}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="flex flex-col items-start gap-2 rounded-[18px] border px-3 py-3 text-left transition-[transform,opacity] active:scale-[0.97] disabled:opacity-40"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[12px]"
              style={{ background: `${accent}22`, color: accent }}
            >
              <Icon size={18} strokeWidth={1.85} />
            </div>
            <div className="min-w-0">
              <div
                className={clsx(TYPO.body, "font-black truncate")}
                style={{ color: LEGACY_COLORS.text }}
              >
                {label}
              </div>
```
