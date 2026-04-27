---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/KpiCard.tsx
status: active
updated: 2026-04-27
source_sha: f7925d8d85e1
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# KpiCard.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/KpiCard.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1216` bytes

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

export function KpiCard({
  label,
  value,
  color,
  active = false,
  onClick,
  className,
}: {
  label: string;
  value: number | string;
  color: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex flex-1 flex-col items-start gap-1 rounded-[20px] border px-4 py-3 text-left transition-[transform,border-color] active:scale-[0.98]",
        className,
      )}
      style={{
        background: active ? `${color}1a` : LEGACY_COLORS.s2,
        borderColor: active ? color : LEGACY_COLORS.border,
      }}
    >
      <div className={clsx(TYPO.caption, "font-semibold uppercase tracking-[1px]")} style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div className={clsx(TYPO.display, "font-black tabular-nums")} style={{ color }}>
        {value}
      </div>
      <div className="h-[2px] w-full rounded-full" style={{ background: active ? color : `${color}40` }} />
    </button>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
