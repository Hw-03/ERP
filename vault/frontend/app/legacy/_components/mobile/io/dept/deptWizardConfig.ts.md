---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/deptWizardConfig.ts
status: active
updated: 2026-04-27
source_sha: e0f1fc4290f2
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# deptWizardConfig.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/deptWizardConfig.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `468` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/dept|frontend/app/legacy/_components/mobile/io/dept]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import type { Department } from "@/lib/api";

export const DEPT_WIZARD_DEPARTMENTS: Department[] = [
  "튜브",
  "고압",
  "진공",
  "튜닝",
  "조립",
  "출하",
];

export const DEPT_STEPS = [
  { key: "department", label: "부서" },
  { key: "person", label: "담당자" },
  { key: "direction", label: "입고 / 출고" },
  { key: "items", label: "품목/수량" },
  { key: "confirm", label: "확인" },
] as const;
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
