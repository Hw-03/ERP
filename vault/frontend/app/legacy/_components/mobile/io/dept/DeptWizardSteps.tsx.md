---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/DeptWizardSteps.tsx
status: active
updated: 2026-04-27
source_sha: 3ae80fed7d8d
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# DeptWizardSteps.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/DeptWizardSteps.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `549` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/dept|frontend/app/legacy/_components/mobile/io/dept]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
// 5.2-C: 769줄 단일 파일을 _dept_steps/ 5파일로 분리.
// 이 파일은 기존 import 경로(./DeptWizardSteps) 호환을 위해 re-export 만 한다.
//
// 새 코드는 가급적 _dept_steps/ 의 개별 파일을 직접 import 하길 권장.

export { StepDepartment } from "./_dept_steps/DeptStep";
export { StepPerson } from "./_dept_steps/PersonStep";
export { StepDirection } from "./_dept_steps/DirectionStep";
export { StepItems } from "./_dept_steps/ItemsStep";
export { StepConfirm } from "./_dept_steps/ConfirmStep";
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
