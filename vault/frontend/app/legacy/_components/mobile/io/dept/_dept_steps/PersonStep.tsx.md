---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/_dept_steps/PersonStep.tsx
status: active
updated: 2026-04-27
source_sha: 270f9df0ac82
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# PersonStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/_dept_steps/PersonStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1985` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/_dept_steps/_dept_steps|frontend/app/legacy/_components/mobile/io/dept/_dept_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useMemo } from "react";
import { PackageSearch } from "lucide-react";
import type { Department, Employee } from "@/lib/api";
import { LEGACY_COLORS } from "../../../../legacyUi";
import { TYPO } from "../../../tokens";
import { EmptyState, PersonAvatar } from "../../../primitives";
import { useDeptWizard } from "../context";
import { StepHeading } from "./_shared";

export function StepPerson({
  employees,
  loading,
}: {
  employees: Employee[];
  loading: boolean;
}) {
  const { state, dispatch } = useDeptWizard();

  const visibleEmployees = useMemo(
    () => employees.filter((e) => e.department === (state.department as Department)),
    [employees, state.department],
  );

  if (loading) {
    return (
      <div className={`${TYPO.body} py-10 text-center`} style={{ color: LEGACY_COLORS.muted2 }}>
        직원 목록을 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <StepHeading
        title={`${state.department ?? ""}부 담당자를 선택합니다`}
        hint="담당자 선택 시 다음 단계로 자동 이동합니다"
      />
      {visibleEmployees.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="등록된 담당자가 없습니다"
          description="관리자 탭에서 직원을 추가해 주세요."
        />
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {visibleEmployees.map((e) => (
            <PersonAvatar
              key={e.employee_id}
              name={e.name}
              department={e.department}
              selected={state.employeeId === e.employee_id}
              onClick={() => {
                dispatch({ type: "SET_EMPLOYEE", employeeId: e.employee_id });
                dispatch({ type: "NEXT" });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
