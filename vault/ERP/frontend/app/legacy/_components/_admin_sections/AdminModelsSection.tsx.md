---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/_admin_sections/AdminModelsSection.tsx
status: active
updated: 2026-04-27
source_sha: f55f0233bc55
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminModelsSection.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/AdminModelsSection.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `4973` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_admin_sections|frontend/app/legacy/_components/_admin_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { Layers, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";
import { useAdminModelsContext } from "./AdminModelsContext";

// Props 없음. AdminModelsProvider 의 Context 에서 모두 읽는다.
export function AdminModelsSection() {
  const ctx = useAdminModelsContext();
  const {
    productModels,
    modelAddName,
    setModelAddName,
    modelAddSymbol,
    setModelAddSymbol,
    addModel: onAddModel,
    deleteModel: onDeleteModel,
  } = ctx;
  return (
    <div className="overflow-y-auto">
      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* 모델 추가 폼 */}
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center gap-2 text-base font-bold">
            <Layers className="h-4 w-4" /> 새 모델 추가
          </div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                모델명 *
              </label>
              <input
# ... (이하 78줄 생략. 원본 참조)

````
