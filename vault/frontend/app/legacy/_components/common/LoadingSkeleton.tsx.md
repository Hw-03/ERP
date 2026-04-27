---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/common/LoadingSkeleton.tsx
status: active
updated: 2026-04-27
source_sha: bcb9a2bf9e69
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# LoadingSkeleton.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/common/LoadingSkeleton.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2660` bytes

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
import { LEGACY_COLORS } from "../legacyUi";

type Variant = "table" | "card" | "list";

interface Props {
  variant?: Variant;
  rows?: number;
  className?: string;
}

function LoadingSkeletonImpl({ variant = "list", rows = 4, className = "" }: Props) {
  const items = Array.from({ length: Math.max(1, rows) });

  if (variant === "table") {
    return (
      <div
        className={`overflow-hidden rounded-[16px] border ${className}`}
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        {items.map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[24px_1fr_1fr_80px_80px] items-center gap-3 px-4 py-3"
            style={{ borderBottom: i === items.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
          >
            <Bar w="full" h={14} />
            <Bar w="80%" h={12} />
            <Bar w="60%" h={12} />
            <Bar w="full" h={12} />
            <Bar w="full" h={12} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`grid gap-3 ${className}`} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {items.map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-[16px] border p-4"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <Bar w="50%" h={10} />
            <Bar w="80%" h={20} />
            <Bar w="40%" h={10} />
          </div>
        ))}
      </div>
    );
  }

  // list
  return (
    <div
      className={`flex flex-col gap-2 rounded-[16px] border p-3 ${className}`}
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {items.map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="h-7 w-7 shrink-0 animate-pulse rounded-full"
            style={{ background: LEGACY_COLORS.s3 }}
          />
          <div className="flex-1 space-y-1.5">
            <Bar w="60%" h={12} />
            <Bar w="40%" h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const LoadingSkeleton = memo(LoadingSkeletonImpl);

function Bar({ w, h }: { w: string; h: number }) {
  return (
    <div
      className="animate-pulse rounded"
      style={{
        width: w === "full" ? "100%" : w,
        height: h,
        background: LEGACY_COLORS.s3,
      }}
    />
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
