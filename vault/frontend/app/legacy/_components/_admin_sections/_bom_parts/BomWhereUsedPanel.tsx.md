---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/_bom_parts/BomWhereUsedPanel.tsx
status: active
updated: 2026-04-27
source_sha: 2ae964615e5c
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# BomWhereUsedPanel.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/_bom_parts/BomWhereUsedPanel.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2168` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_bom_parts/_bom_parts|frontend/app/legacy/_components/_admin_sections/_bom_parts]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

// 5.6-E: 선택된 parent 가 다른 BOM 의 child 로 등록된 위치(역참조) 표시.
// AdminBomContext 의존. parent 미선택 또는 결과 0건이면 렌더 안 함.

import { LEGACY_COLORS, formatNumber } from "../../legacyUi";
import { useAdminBomContext } from "../AdminBomContext";

export function BomWhereUsedPanel() {
  const { parentId, whereUsedRows } = useAdminBomContext();
  if (!parentId || whereUsedRows.length === 0) return null;

  return (
    <div
      className="shrink-0 overflow-hidden rounded-[28px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          이 품목이 사용되는 곳 (Where-Used)
        </div>
        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {whereUsedRows.length}건 — 다른 BOM 에서 child 로 등록된 위치
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {whereUsedRows.map((row) => (
          <div
            key={row.bom_id}
            className="flex items-center justify-between px-4 py-2 text-sm"
            style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" style={{ color: LEGACY_COLORS.text }}>
                {row.parent_item_name}
              </div>
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {row.parent_erp_code}
              </div>
            </div>
            <div className="shrink-0 text-right text-sm" style={{ color: LEGACY_COLORS.text }}>
              ×{formatNumber(row.quantity)}
              <span className="ml-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {row.unit}
              </span>
            </div>
          </div>
        ))}
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
