---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/primitives/StatusBadge.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# StatusBadge.tsx — StatusBadge.tsx 설명

## 이 파일은 무엇을 책임지나

`StatusBadge.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `StatusBadge`
- `MesTone`
- `Tone`

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
import { toMesTone, type MesTone } from "@/lib/mes-status";

// 모바일 StatusBadge 의 외부 시그니처 — "ok"/"warn" 등 구버전 톤도 그대로 받는다.
type Tone = "ok" | "warn" | "danger" | "info" | "muted";

// 내부 단일 소스: MesTone (success/warning/danger/info/neutral/muted) 기준 색.
// "neutral" 은 모바일에서 muted 와 시각적으로 동일하게 보이도록 muted 색을 사용.
const TONE_BY_MES: Record<MesTone, string> = {
  success: LEGACY_COLORS.green,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  info: LEGACY_COLORS.blue,
  neutral: LEGACY_COLORS.muted,
  muted: LEGACY_COLORS.muted,
};

export function StatusBadge({
  label,
  tone = "info",
  color,
  className,
  dot = false,
}: {
  label: string;
  tone?: Tone;
  color?: string;
  className?: string;
  dot?: boolean;
}) {
  // toMesTone 으로 정규화 — "ok"→success, "warn"→warning. 외부 호출 시그니처 변화 없음.
  const c = color ?? TONE_BY_MES[toMesTone(tone)];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-[8px] px-2 py-[2px] font-semibold",
        TYPO.caption,
        className,
      )}
      style={{ background: `${c}22`, color: c }}
    >
      {dot ? <span className="h-[6px] w-[6px] rounded-full" style={{ background: c }} /> : null}
      {label}
    </span>
  );
}
```
