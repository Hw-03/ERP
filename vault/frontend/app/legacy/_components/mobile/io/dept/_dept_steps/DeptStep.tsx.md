---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/_dept_steps/DeptStep.tsx
status: active
updated: 2026-04-27
source_sha: 6f765fed2b18
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# DeptStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/_dept_steps/DeptStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2101` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/_dept_steps/_dept_steps|frontend/app/legacy/_components/mobile/io/dept/_dept_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { LEGACY_COLORS, employeeColor } from "../../../../legacyUi";
import { TYPO } from "../../../tokens";
import { DEPT_WIZARD_DEPARTMENTS } from "../deptWizardConfig";
import { useDeptWizard } from "../context";
import { StepHeading } from "./_shared";

export function StepDepartment() {
  const { state, dispatch } = useDeptWizard();
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading
        title="어느 부서의 거래인지 선택합니다"
        hint="선택 시 바로 해당 부서의 담당자 단계로 넘어갑니다"
      />
      <div className="grid grid-cols-2 gap-2">
        {DEPT_WIZARD_DEPARTMENTS.map((dept) => {
          const active = state.department === dept;
          const color = employeeColor(dept);
          return (
            <button
              key={dept}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_DEPARTMENT", department: dept });
                dispatch({ type: "NEXT" });
              }}
              className="flex flex-col items-start gap-1 rounded-[20px] border px-4 py-4 text-left active:scale-[0.98]"
              style={{
                background: active ? `${color}1a` : LEGACY_COLORS.s2,
                borderColor: active ? color : LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-[14px]"
                style={{ background: `${color}22`, color }}
              >
                <span className={`${TYPO.body} font-black`}>{dept.slice(0, 1)}</span>
              </div>
              <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {dept}
              </div>
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                {dept === "출하" ? "출하 · 패키지" : `${dept}부`}
              </div>
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
