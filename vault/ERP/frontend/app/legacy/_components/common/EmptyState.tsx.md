---
type: file-explanation
source_path: "frontend/app/legacy/_components/common/EmptyState.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# EmptyState.tsx — EmptyState.tsx 설명

## 이 파일은 무엇을 책임지나

`EmptyState.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `EmptyStateImpl`
- `EmptyState`
- `ReactNode`
- `EmptyStateVariant`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/common/📁_common]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { memo, type ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

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
```
