---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/mobile/primitives/WizardHeader.tsx
status: active
updated: 2026-04-27
source_sha: f032c318eb4a
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# WizardHeader.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/WizardHeader.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1766` bytes

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
import { SummaryChipBar, type SummaryChip } from "./SummaryChipBar";

export function WizardHeader({
  steps,
  current,
  chips,
  className,
}: {
  steps: { key: string; label: string }[];
  current: number;
  chips?: SummaryChip[];
  className?: string;
}) {
  const active = steps[current];
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1">
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "active" : "todo";
          const bg =
            state === "active"
              ? LEGACY_COLORS.blue
              : state === "done"
              ? `${LEGACY_COLORS.blue as string}88`
              : LEGACY_COLORS.s3;
          return (
            <div
              key={step.key}
              className="h-[4px] flex-1 rounded-full transition-colors"
              style={{ background: bg }}
# ... (이하 24줄 생략. 원본 참조)

````
