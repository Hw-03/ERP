---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/PrimaryActionButton.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# PrimaryActionButton.tsx — PrimaryActionButton.tsx 설명

## 이 파일은 무엇을 책임지나

`PrimaryActionButton.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `PrimaryActionButton`
- `Intent`

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
import { formatQty } from "@/lib/mes/format";
type Intent = "primary" | "success" | "danger" | "neutral";

const INTENT_STYLE: Record<Intent, { bg: string; fg: string }> = {
  primary: { bg: LEGACY_COLORS.blue, fg: LEGACY_COLORS.white },
  success: { bg: LEGACY_COLORS.green, fg: "#041008" },
  danger: { bg: LEGACY_COLORS.red, fg: LEGACY_COLORS.white },
  neutral: { bg: LEGACY_COLORS.s3, fg: LEGACY_COLORS.text },
};

export function PrimaryActionButton({
  label,
  sublabel,
  count,
  total,
  totalUnit,
  intent = "primary",
  icon: Icon,
  onClick,
  disabled,
  loadingText,
  className,
}: {
  label: string;
  sublabel?: string;
  count?: number;
  total?: number;
  totalUnit?: string;
  intent?: Intent;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  loadingText?: string;
  className?: string;
}) {
  const { bg, fg } = INTENT_STYLE[intent];
  const showMeta = count != null || total != null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex w-full items-center justify-center gap-3 rounded-[16px] px-4 py-[14px] font-black transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40",
        className,
      )}
      style={{ background: bg, color: fg }}
    >
```
