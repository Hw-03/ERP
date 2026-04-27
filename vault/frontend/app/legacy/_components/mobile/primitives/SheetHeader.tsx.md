---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/SheetHeader.tsx
status: active
updated: 2026-04-27
source_sha: 72a05e2e9201
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# SheetHeader.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/SheetHeader.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1133` bytes

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
import { X } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";
import { IconButton } from "./IconButton";

export function SheetHeader({
  title,
  subtitle,
  onClose,
  rightAction,
  className,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-3 px-5 pb-3 pt-2", className)}>
      <div className="flex min-w-0 flex-col">
        <div className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.text }}>
          {title}
        </div>
        {subtitle ? (
          <div className={clsx(TYPO.caption, "mt-[2px]")} style={{ color: LEGACY_COLORS.muted2 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {rightAction}
        {onClose ? <IconButton icon={X} label="닫기" onClick={onClose} size="sm" /> : null}
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
