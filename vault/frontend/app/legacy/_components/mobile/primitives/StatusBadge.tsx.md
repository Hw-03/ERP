---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/mobile/primitives/StatusBadge.tsx
status: active
updated: 2026-04-27
source_sha: 8289f85e27b8
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# StatusBadge.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/StatusBadge.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `998` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/primitives/primitives|frontend/app/legacy/_components/mobile/primitives]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

type Tone = "ok" | "warn" | "danger" | "info" | "muted";

const TONE: Record<Tone, string> = {
  ok: LEGACY_COLORS.green,
  warn: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  info: LEGACY_COLORS.blue,
  muted: LEGACY_COLORS.muted,
};

export function StatusBadge({
  label,
  tone = "info",
  color,
  className,
  dot = false,
}: {
  label: string;
  tone?: Tone;
  color?: string;
  className?: string;
  dot?: boolean;
}) {
  const c = color ?? TONE[tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-[8px] px-2 py-[2px] font-semibold",
        TYPO.caption,
# ... (이하 9줄 생략. 원본 참조)

````
