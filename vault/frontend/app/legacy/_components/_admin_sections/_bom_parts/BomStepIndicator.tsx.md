---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/_bom_parts/BomStepIndicator.tsx
status: active
updated: 2026-04-27
source_sha: c902a0f16c88
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# BomStepIndicator.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/_bom_parts/BomStepIndicator.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1715` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_bom_parts/_bom_parts|frontend/app/legacy/_components/_admin_sections/_bom_parts]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

// 5.5-E: AdminBomSection 의 4-step 인디케이터 추출 (재사용 + 가독성 향상).

import { LEGACY_COLORS } from "../../legacyUi";

type Step = {
  step: string;
  label: string;
  active: boolean;
  done: boolean;
};

export function BomStepIndicator({
  parentSelected,
  childSelected,
}: {
  parentSelected: boolean;
  childSelected: boolean;
}) {
  const steps: Step[] = [
    { step: "①", label: "부모품목 선택", active: !parentSelected, done: parentSelected },
    {
      step: "②",
      label: "자식품목 선택",
      active: parentSelected && !childSelected,
      done: childSelected,
    },
    { step: "③", label: "소요량 입력", active: childSelected, done: false },
    { step: "④", label: "저장", active: false, done: false },
  ];

  return (
    <div className="shrink-0 flex items-center gap-2 text-xs font-bold">
      {steps.map(({ step, label, active, done }) => (
        <span
          key={step}
          className="flex items-center gap-1 rounded-full px-2.5 py-1"
          style={{
            background: done
              ? `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`
              : active
                ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 16%, transparent)`
                : LEGACY_COLORS.s2,
            color: done ? LEGACY_COLORS.green : active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
            border: `1px solid ${
              done ? LEGACY_COLORS.green : active ? LEGACY_COLORS.blue : LEGACY_COLORS.border
            }`,
          }}
        >
          {done ? "✓" : step} {label}
        </span>
      ))}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
