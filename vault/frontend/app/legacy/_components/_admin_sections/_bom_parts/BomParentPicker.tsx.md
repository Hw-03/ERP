---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/_bom_parts/BomParentPicker.tsx
status: active
updated: 2026-04-27
source_sha: 378d62176567
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# BomParentPicker.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/_bom_parts/BomParentPicker.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `4076` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_bom_parts/_bom_parts|frontend/app/legacy/_components/_admin_sections/_bom_parts]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

// 5.6-E: AdminBomSection 좌측 — 상위 품목 선택 패널.
// AdminBomContext 의존 (prop drilling 0).

import { LEGACY_COLORS } from "../../legacyUi";
import { BOM_PARENT_CATS } from "../adminShared";
import { useAdminBomContext } from "../AdminBomContext";

export function BomParentPicker() {
  const {
    parentId,
    setParentId,
    setPendingChildId,
    bomParentItems,
    bomParentSearch,
    setBomParentSearch,
    bomParentCat,
    setBomParentCat,
    setBomChildSearch,
    setBomChildCat,
  } = useAdminBomContext();

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          상위 품목 선택
        </div>
        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          RM 제외 · {bomParentItems.length}건 표시
        </div>
      </div>
      <div className="shrink-0 px-3 pt-3">
        <input
          value={bomParentSearch}
          onChange={(e) => setBomParentSearch(e.target.value)}
          placeholder="품목명 / ERP 코드 검색"
          className="mb-2 w-full rounded-[12px] border px-3 py-1.5 text-sm outline-none"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
        <div className="mb-2 flex flex-wrap gap-1">
          {BOM_PARENT_CATS.map((cat) => (
            <button
              key={cat}
              onClick={() => setBomParentCat(cat)}
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{
                background: bomParentCat === cat ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                color: bomParentCat === cat ? "#fff" : LEGACY_COLORS.muted2,
                border: `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {bomParentItems.map((item, index) => (
          <button
            key={item.item_id}
            onClick={() => {
              setParentId(item.item_id);
              setPendingChildId(null);
              setBomChildSearch("");
              setBomChildCat("ALL");
            }}
            className="block w-full px-3 py-2.5 text-left transition-colors"
            style={{
              background:
                parentId === item.item_id
                  ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                  : "transparent",
              borderBottom: index === bomParentItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 rounded px-1 py-0.5 text-xs font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)`,
                  color: LEGACY_COLORS.blue,
                }}
              >
                {item.category}
              </span>
              <div
                className="truncate text-sm font-medium"
                style={{ color: parentId === item.item_id ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}
              >
                {item.item_name}
              </div>
            </div>
            <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
          </button>
        ))}
        {bomParentItems.length === 0 && (
          <div className="px-4 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>결과 없음</div>
        )}
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
