---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_steps/index.ts
status: active
updated: 2026-04-27
source_sha: 580c36e2d952
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# index.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_steps/index.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `525` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps|frontend/app/legacy/_components/_warehouse_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
// 입출고 wizard step 컴포넌트 패키지.
// 기존 _warehouse_steps.tsx (1,135줄)을 책임 단위로 분할 — Phase 4.
// 외부 import 경로(`./_warehouse_steps`)는 동일하게 유지된다.

export * from "./_constants";
export { WizardStepCard } from "./_atoms";
export { EmployeeStep } from "./EmployeeStep";
export { WorkTypeStep } from "./WorkTypeStep";
export { ItemPickStep } from "./ItemPickStep";
export { QuantityStep } from "./QuantityStep";
export { ExecuteStep } from "./ExecuteStep";
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
