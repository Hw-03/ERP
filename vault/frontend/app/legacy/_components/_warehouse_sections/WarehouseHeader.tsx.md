---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_sections/WarehouseHeader.tsx
status: active
updated: 2026-04-27
source_sha: 8d48e7f49670
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# WarehouseHeader.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_sections/WarehouseHeader.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `492` bytes

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
import { LoadFailureCard } from "../common/LoadFailureCard";

export function WarehouseHeader({ loadFailure }: { loadFailure: string | null }) {
  return (
    <>
      <header className="pb-1">
        <h1 className="text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>
          입출고 작업
        </h1>
      </header>
      {loadFailure && <LoadFailureCard message={loadFailure} />}
    </>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
