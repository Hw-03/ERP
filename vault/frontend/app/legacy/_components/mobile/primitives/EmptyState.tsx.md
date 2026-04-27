---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/EmptyState.tsx
status: active
updated: 2026-04-27
source_sha: 55ef9a0037de
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# EmptyState.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/EmptyState.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1137` bytes

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
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted }}
      >
        <Icon size={24} strokeWidth={1.75} />
      </div>
      <div className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.text }}>
        {title}
      </div>
      {description ? (
        <div className={clsx(TYPO.body)} style={{ color: LEGACY_COLORS.muted2 }}>
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
