---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/AdminModelsSection.tsx
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
                value={modelAddName}
                onChange={(e) => setModelAddName(e.target.value)}
                placeholder="예: ADX8000"
                className="w-full rounded-[14px] border px-3 py-2 text-base outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                기호 (1자, 선택)
              </label>
              <input
                value={modelAddSymbol}
                onChange={(e) => setModelAddSymbol(e.target.value.slice(0, 5))}
                placeholder="자동 생성"
                className="w-full rounded-[14px] border px-3 py-2 text-base outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </div>
            <button
              disabled={!modelAddName.trim()}
              onClick={onAddModel}
              className="w-full rounded-[14px] py-2.5 text-base font-bold text-white"
              style={{
                background: modelAddName.trim() ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                opacity: modelAddName.trim() ? 1 : 0.5,
              }}
            >
              모델 추가
            </button>
          </div>
        </div>

        {/* 모델 목록 */}
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-base font-bold">
              <Layers className="h-4 w-4" /> 등록된 모델
            </div>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{productModels.length}개</span>
          </div>
          {productModels.length === 0 ? (
            <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>등록된 모델이 없습니다.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {productModels.map((model) => (
                <div
                  key={model.slot}
                  className="flex flex-col items-center justify-center rounded-[20px] border p-4 text-center relative group hover:bg-white/[0.06]"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-black text-white"
                    style={{ background: LEGACY_COLORS.purple }}
                  >
                    {model.symbol ?? "?"}
                  </div>
                  <div className="mt-3 text-base font-bold">{model.model_name}</div>
                  <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>슬롯 {model.slot}</div>
                  <button
                    onClick={() => onDeleteModel(model.slot)}
                    className="absolute top-2 right-2 flex items-center justify-center rounded-full border p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ borderColor: LEGACY_COLORS.red, color: LEGACY_COLORS.red }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
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
