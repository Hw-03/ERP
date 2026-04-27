---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/AsyncState.tsx
status: active
updated: 2026-04-27
source_sha: e4dee84b0df4
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AsyncState.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/AsyncState.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2209` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/primitives/primitives|frontend/app/legacy/_components/mobile/primitives]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import clsx from "clsx";
import { AlertCircle, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function AsyncState({
  loading,
  error,
  empty,
  skeleton,
  emptyView,
  onRetry,
  children,
}: {
  loading: boolean;
  error?: string | null;
  empty?: boolean;
  skeleton?: React.ReactNode;
  emptyView?: React.ReactNode;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (error) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-[20px] border px-5 py-8 text-center"
        style={{
          background: "rgba(242,95,92,.08)",
          borderColor: "rgba(242,95,92,.28)",
        }}
      >
        <AlertCircle size={22} color={LEGACY_COLORS.red} />
        <div className={clsx(TYPO.body, "font-semibold")} style={{ color: LEGACY_COLORS.red }}>
          {error}
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={clsx(
              TYPO.caption,
              "flex items-center gap-1 rounded-full border px-3 py-[6px] font-semibold active:scale-95",
            )}
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            <RefreshCw size={12} /> 다시 시도
          </button>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return <>{skeleton ?? <AsyncSkeletonRows />}</>;
  }

  if (empty) {
    return <>{emptyView ?? null}</>;
  }

  return <>{children}</>;
}

export function AsyncSkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-[68px] rounded-[20px] border animate-pulse"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            opacity: 0.7 - i * 0.1,
          }}
        />
      ))}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
