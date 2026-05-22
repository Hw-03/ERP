---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/MoreMenuRow.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MoreMenuRow.tsx — MoreMenuRow.tsx 설명

## 이 파일은 무엇을 책임지나

`MoreMenuRow.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MoreMenuRow`
- `LucideIcon`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/primitives/📁_primitives]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import clsx from "clsx";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function MoreMenuRow({
  icon: Icon,
  label,
  description,
  badge,
  tone,
  onClick,
  disabled,
  className,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  badge?: string | number | null;
  tone?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const accent = tone ?? (LEGACY_COLORS.blue as string);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40",
        className,
      )}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: `${accent}22`, color: accent }}
      >
        <Icon size={20} strokeWidth={1.85} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.text }}>
          {label}
        </div>
        {description ? (
          <div className={clsx(TYPO.caption, "truncate")} style={{ color: LEGACY_COLORS.muted2 }}>
            {description}
          </div>
        ) : null}
      </div>
      {badge != null && badge !== "" ? (
```
