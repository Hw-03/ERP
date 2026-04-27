---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_sections/WarehouseStickySummary.tsx
status: active
updated: 2026-04-27
source_sha: 77cbdc5ea470
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# WarehouseStickySummary.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_sections/WarehouseStickySummary.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1164` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_sections/_warehouse_sections|frontend/app/legacy/_components/_warehouse_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { LEGACY_COLORS } from "../legacyUi";

type Summary = { n: number; title: string; text: string };

export function WarehouseStickySummary({ summary }: { summary: Summary | null }) {
  if (!summary) return null;
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3 rounded-[18px] border px-4 py-3 backdrop-blur-md"
      style={{
        background: `color-mix(in srgb, ${LEGACY_COLORS.s1} 92%, transparent)`,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}
      >
        {summary.n}
      </div>
      <div
        className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.12em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {summary.title}
      </div>
      <div
        className="min-w-0 max-w-[60%] truncate text-sm font-bold"
        style={{ color: LEGACY_COLORS.text }}
      >
        {summary.text}
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
