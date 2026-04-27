---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/common/EmptyState.tsx
status: active
updated: 2026-04-27
source_sha: fb68aa710a83
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# EmptyState.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/common/EmptyState.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2503` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/common/common|frontend/app/legacy/_components/common]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { memo, type ReactNode } from "react";
import { LEGACY_COLORS } from "../legacyUi";

export type EmptyStateVariant = "no-data" | "no-search-result" | "filtered-out";

const VARIANT_DEFAULTS: Record<EmptyStateVariant, { title: string; description?: string }> = {
  "no-data": {
    title: "표시할 데이터가 없습니다",
    description: "데이터를 등록하면 이곳에 표시됩니다.",
  },
  "no-search-result": {
    title: "검색 결과가 없습니다",
    description: "검색어를 다시 확인하거나 필터를 조정해 보세요.",
  },
  "filtered-out": {
    title: "필터로 모든 항목이 가려졌습니다",
    description: "필터를 해제하면 다시 표시됩니다.",
  },
};

interface Props {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
  className?: string;
}

function EmptyStateImpl({
  variant = "no-data",
  title,
  description,
  icon,
  action,
  compact = false,
  className = "",
}: Props) {
  const fallback = VARIANT_DEFAULTS[variant];
  const finalTitle = title ?? fallback.title;
  const finalDescription = description ?? fallback.description;

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? "py-6" : "py-12"} ${className}`}
      style={{ color: LEGACY_COLORS.muted2 }}
    >
      {icon && <div className="opacity-70">{icon}</div>}
      <div className={`${compact ? "text-sm" : "text-base"} font-bold`} style={{ color: LEGACY_COLORS.text }}>
        {finalTitle}
      </div>
      {finalDescription && (
        <div className={compact ? "text-[11px]" : "text-xs"} style={{ color: LEGACY_COLORS.muted2 }}>
          {finalDescription}
        </div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-[12px] border px-3 py-1.5 text-xs font-bold transition-colors hover:brightness-125"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, ${LEGACY_COLORS.border})`,
            color: LEGACY_COLORS.blue,
            background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export const EmptyState = memo(EmptyStateImpl);
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
