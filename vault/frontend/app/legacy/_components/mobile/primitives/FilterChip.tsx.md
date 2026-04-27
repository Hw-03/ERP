---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/FilterChip.tsx
status: active
updated: 2026-04-27
source_sha: 5ce1f9f9f7e6
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# FilterChip.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/FilterChip.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1180` bytes

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
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function FilterChip({
  label,
  active,
  onClick,
  color,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  className?: string;
}) {
  const activeColor = color ?? LEGACY_COLORS.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "shrink-0 rounded-full border px-3 py-[6px] font-semibold transition-all duration-150 active:scale-95",
        TYPO.caption,
        className,
      )}
      style={
        active
          ? { background: activeColor, borderColor: activeColor, color: "#fff" }
          : { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }
      }
    >
      {label}
    </button>
  );
}

export function FilterChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex gap-2 overflow-x-auto scrollbar-hide pb-[2px]", className)}>{children}</div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
