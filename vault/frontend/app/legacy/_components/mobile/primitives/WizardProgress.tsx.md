---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/WizardProgress.tsx
status: active
updated: 2026-04-27
source_sha: 20f6239a4d23
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# WizardProgress.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/WizardProgress.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1438` bytes

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

export function WizardProgress({
  steps,
  current,
  className,
}: {
  steps: { key: string; label: string }[];
  current: number;
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
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <div className={clsx(TYPO.caption, "font-semibold")} style={{ color: LEGACY_COLORS.muted2 }}>
          Step {current + 1} / {steps.length}
        </div>
        <div className={clsx(TYPO.caption, "font-black")} style={{ color: LEGACY_COLORS.blue }}>
          {active?.label}
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
