---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/mobile/primitives/PrimaryActionButton.tsx
status: active
updated: 2026-04-27
source_sha: 5031184b3f22
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# PrimaryActionButton.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/PrimaryActionButton.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2653` bytes

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
import type { LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";
import { formatNumber } from "../../legacyUi";

type Intent = "primary" | "success" | "danger" | "neutral";

const INTENT_STYLE: Record<Intent, { bg: string; fg: string }> = {
  primary: { bg: LEGACY_COLORS.blue, fg: "#fff" },
  success: { bg: LEGACY_COLORS.green, fg: "#041008" },
  danger: { bg: LEGACY_COLORS.red, fg: "#fff" },
  neutral: { bg: LEGACY_COLORS.s3, fg: LEGACY_COLORS.text },
};

export function PrimaryActionButton({
  label,
  sublabel,
  count,
  total,
  totalUnit,
  intent = "primary",
  icon: Icon,
  onClick,
  disabled,
  loadingText,
  className,
}: {
  label: string;
  sublabel?: string;
  count?: number;
  total?: number;
  totalUnit?: string;
# ... (이하 55줄 생략. 원본 참조)

````
