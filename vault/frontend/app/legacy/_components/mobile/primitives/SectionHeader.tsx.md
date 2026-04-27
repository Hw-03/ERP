---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/SectionHeader.tsx
status: active
updated: 2026-04-27
source_sha: 54a02796ad3c
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# SectionHeader.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/SectionHeader.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `934` bytes

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

export function SectionHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-end justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-col">
        {subtitle ? (
          <div
            className={clsx(TYPO.caption, "font-semibold uppercase tracking-[1.2px]")}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {subtitle}
          </div>
        ) : null}
        <div className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.text }}>
          {title}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
