---
type: file-explanation
source_path: "frontend/app/legacy/_components/common/LoadFailureCard.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# LoadFailureCard.tsx — LoadFailureCard.tsx 설명

## 이 파일은 무엇을 책임지나

`LoadFailureCard.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `LoadFailureCardImpl`
- `LoadFailureCard`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/common/📁_common]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

interface Props {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  prefix?: string;
}

function LoadFailureCardImpl({
  message,
  onRetry,
  retryLabel = "동기화",
  prefix = "데이터를 불러오지 못했습니다",
}: Props) {
  const handleRetry = onRetry ?? (() => window.location.reload());
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-sm"
      style={{
        background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
        color: LEGACY_COLORS.red,
      }}
      role="alert"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate font-bold">
          {prefix} — {message}
        </span>
      </div>
      <button
        type="button"
        onClick={handleRetry}
        className="shrink-0 rounded-[10px] border px-3 py-1.5 text-xs font-bold transition-colors hover:brightness-125"
        style={{
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
          color: LEGACY_COLORS.red,
          background: "transparent",
        }}
      >
        {retryLabel}
      </button>
    </div>
  );
}

export const LoadFailureCard = memo(LoadFailureCardImpl);
```
