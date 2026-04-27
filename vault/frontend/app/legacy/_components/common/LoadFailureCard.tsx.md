---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/common/LoadFailureCard.tsx
status: active
updated: 2026-04-27
source_sha: 53630349e779
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# LoadFailureCard.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/common/LoadFailureCard.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1591` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/common/common|frontend/app/legacy/_components/common]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";

interface Props {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  prefix?: string;
}

function LoadFailureCardImpl({
  message,
  onRetry,
  retryLabel = "새로고침",
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
