---
type: file-explanation
source_path: "frontend/app/legacy/_components/common/StatusPill.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# StatusPill.tsx — StatusPill.tsx 설명

## 이 파일은 무엇을 책임지나

`StatusPill.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `inferToneFromStatus`
- `StatusPillImpl`
- `StatusPill`
- `MesTone`
- `StatusPillTone`
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
import { inferTone, type MesTone } from "@/lib/mes-status";

// 기존 prop 타입을 깨지 않기 위한 alias — MesTone 의 부분 집합 + "brand".
export type StatusPillTone = Extract<MesTone, "info" | "success" | "warning" | "danger" | "neutral"> | "brand";

const TONE_COLOR: Record<StatusPillTone, string> = {
  info: LEGACY_COLORS.blue,
  success: LEGACY_COLORS.green,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  neutral: LEGACY_COLORS.muted2,
  brand: LEGACY_COLORS.cyan,
};

interface Props {
  label: string;
  tone?: StatusPillTone;
  showDot?: boolean;
  maxWidth?: number | string;
  className?: string;
  title?: string;
}

function StatusPillImpl({
  label,
  tone = "info",
  showDot = true,
  maxWidth = 260,
  className = "",
  title,
}: Props) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 truncate rounded-full border px-3 py-2 text-xs font-bold ${className}`}
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        maxWidth,
      }}
      title={title ?? label}
    >
      {showDot && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
```
