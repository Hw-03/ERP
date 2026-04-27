---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopRightPanel.tsx
status: active
updated: 2026-04-27
source_sha: f2ae4445ff57
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# DesktopRightPanel.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/DesktopRightPanel.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1204` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { LEGACY_COLORS } from "./legacyUi";

export function DesktopRightPanel({
  title,
  subtitle,
  headerBadge,
  children,
}: {
  title: string;
  subtitle?: string;
  headerBadge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside
      className="flex h-full min-h-0 w-[420px] shrink-0 flex-col overflow-hidden rounded-[32px] border px-5 py-5"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-4 px-1 pb-4 border-b" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[22px] font-black">{title}</div>
            {subtitle ? (
              <div className="mt-1.5 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {headerBadge ? <div className="shrink-0 pt-1">{headerBadge}</div> : null}
        </div>
      </div>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
