---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/_dept_steps/DirectionStep.tsx
status: active
updated: 2026-04-27
source_sha: a721be5cd5a2
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# DirectionStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/_dept_steps/DirectionStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2633` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/_dept_steps/_dept_steps|frontend/app/legacy/_components/mobile/io/dept/_dept_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { ArrowDownToLine, ArrowUpFromLine, ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "../../../../legacyUi";
import { TYPO } from "../../../tokens";
import { useDeptWizard } from "../context";
import { StepHeading } from "./_shared";

export function StepDirection() {
  const { state, dispatch } = useDeptWizard();
  const options = [
    {
      key: "in" as const,
      label: "부서 입고",
      description: "창고 재고를 부서로 받아들입니다",
      icon: ArrowDownToLine,
      color: LEGACY_COLORS.green,
    },
    {
      key: "out" as const,
      label: "부서 출고",
      description: "부서에서 창고로 내보내거나 출하합니다",
      icon: ArrowUpFromLine,
      color: LEGACY_COLORS.red,
    },
  ];
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading
        title="입고인지 출고인지 선택합니다"
        hint="부서가 받는지(입고) 내보내는지(출고)에 따라 재고가 반대로 움직입니다"
      />
      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const active = state.direction === o.key;
          const Icon = o.icon;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_DIRECTION", direction: o.key });
                dispatch({ type: "NEXT" });
              }}
              className="flex items-center gap-3 rounded-[20px] border px-4 py-4 text-left active:scale-[0.99]"
              style={{
                background: active ? `${o.color}1a` : LEGACY_COLORS.s2,
                borderColor: active ? o.color : LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: `${o.color}22`, color: o.color }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {o.label}
                </div>
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  {o.description}
                </div>
              </div>
              <ChevronRight size={20} color={LEGACY_COLORS.muted} />
            </button>
          );
        })}
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
