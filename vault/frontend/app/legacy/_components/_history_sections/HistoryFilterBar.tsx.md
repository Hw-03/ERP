---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryFilterBar.tsx
status: active
updated: 2026-04-27
source_sha: b18d17fb6881
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# HistoryFilterBar.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_history_sections/HistoryFilterBar.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `7243` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_history_sections/_history_sections|frontend/app/legacy/_components/_history_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { CalendarDays, List, Search, X } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";
import { DATE_OPTIONS, TYPE_OPTIONS } from "./historyShared";

function Chip({
  active,
  label,
  onClick,
  tone = LEGACY_COLORS.blue,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold transition-all hover:brightness-110"
      style={{
        background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
  );
}

type Props = {
  search: string;
  setSearch: (v: string) => void;
# ... (이하 144줄 생략. 원본 참조)

````
